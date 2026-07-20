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
            job = db.claim_job(conn)
            if job is None:
                time.sleep(config.POLL_INTERVAL_SECONDS)
                continue
            log.info("claimed job %s (%s, tier=%s)", job["id"], job["source_type"], job["tier"])
            pipeline.process_job(conn, job)
        except psycopg.OperationalError as exc:
            log.warning("database connection lost (%s); reconnecting", exc)
            try:
                conn.close()
            except Exception:
                pass
            conn = db.connect()
        except KeyboardInterrupt:
            log.info("worker stopping")
            return


if __name__ == "__main__":
    run()
