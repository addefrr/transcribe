import logging
import time

import psycopg

from . import config, db, pipeline

log = logging.getLogger(__name__)


def run() -> None:
    logging.basicConfig(
        level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s"
    )
    backends = config.TRANSCRIBE_BACKEND or (
        f"standard=qwen(+{config.STANDARD_FALLBACK_BACKEND}), premium={config.PREMIUM_BACKEND}"
    )
    log.info("worker starting (backends: %s, storage=%s)", backends, config.STORAGE_DRIVER)
    conn = db.connect()
    last_stale_sweep = 0.0
    while True:
        try:
            now = time.monotonic()
            if now - last_stale_sweep > 60:
                db.requeue_stale(conn)
                pipeline.sweep_expired_audio(conn)
                last_stale_sweep = now
            # Expand any pending playlist batches first (quick metadata calls).
            batch = db.claim_batch(conn)
            if batch is not None:
                log.info("claimed batch %s", batch["id"])
                pipeline.process_batch(conn, batch)
                continue
            job = db.claim_job(conn)
            if job is None:
                time.sleep(config.POLL_INTERVAL_SECONDS)
                continue
            log.info("claimed job %s (%s, tier=%s)", job["id"], job["source_type"], job["tier"])
            pipeline.process_job(conn, job)
        except KeyboardInterrupt:
            log.info("worker stopping")
            return
        except psycopg.Error as exc:
            # Any database error — a dropped connection, a restart, or a stale
            # prepared-statement plan after a migration ("cached plan must not
            # change result type") — is recovered by reconnecting rather than
            # crashing the worker. Stuck jobs are picked back up by requeue_stale.
            log.warning("database error (%s); reconnecting", exc)
            try:
                conn.close()
            except Exception:
                pass
            time.sleep(1)
            conn = db.connect()
        except Exception:
            # Never let an unexpected error kill the poll loop; back off briefly.
            log.exception("unexpected error in worker loop; continuing")
            time.sleep(config.POLL_INTERVAL_SECONDS)


if __name__ == "__main__":
    run()
