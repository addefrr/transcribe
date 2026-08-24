import logging
import os
import shutil

from . import config
from .errors import JobError

log = logging.getLogger(__name__)

_s3_client = None


def _s3():
    global _s3_client
    if _s3_client is None:
        import boto3
        from botocore.config import Config as BotoConfig

        _s3_client = boto3.client(
            "s3",
            endpoint_url=config.S3_ENDPOINT or None,
            region_name=config.S3_REGION,
            aws_access_key_id=config.S3_ACCESS_KEY_ID,
            aws_secret_access_key=config.S3_SECRET_ACCESS_KEY,
            config=BotoConfig(
                s3={"addressing_style": "path" if config.S3_FORCE_PATH_STYLE else "auto"}
            ),
        )
    return _s3_client


def _safe_local_path(key: str) -> str:
    base = os.path.realpath(config.UPLOAD_DIR)
    path = os.path.realpath(os.path.join(base, key))
    if not path.startswith(base + os.sep):
        raise JobError("Invalid upload key.")
    return path


def fetch_upload(key: str, workdir: str, expected_size: int) -> str:
    """Bring a verified uploaded file into the workdir; returns its path."""
    dest = os.path.join(workdir, "upload" + os.path.splitext(key)[1])
    if config.STORAGE_DRIVER == "local":
        src = _safe_local_path(key)
        if not os.path.exists(src):
            raise JobError("Uploaded file not found — it may have expired.")
        if os.path.getsize(src) != expected_size:
            raise JobError("Uploaded file size changed after it was checked.")
        shutil.copyfile(src, dest)
    else:
        try:
            head = _s3().head_object(Bucket=config.S3_BUCKET, Key=key)
            if int(head.get("ContentLength", -1)) != expected_size:
                raise JobError("Uploaded file size changed after it was checked.")
            _s3().download_file(config.S3_BUCKET, key, dest)
            if os.path.getsize(dest) != expected_size:
                raise JobError("Downloaded upload did not match its expected size.")
        except JobError:
            raise
        except Exception as exc:
            raise JobError("Could not fetch the upload from storage.") from exc
    return dest


def put_file(path: str, key: str) -> None:
    _s3().upload_file(path, config.S3_BUCKET, key)


def persist(path: str, key: str) -> None:
    """Store a file under `key` for later retrieval (local copy or S3 upload)."""
    if config.STORAGE_DRIVER == "local":
        dest = _safe_local_path(key)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        shutil.copyfile(path, dest)
    else:
        put_file(path, key)


def copy_key(src_key: str, dst_key: str) -> bool:
    """Copy a stored object to a new key without re-transcoding. Returns False if
    the source no longer exists (e.g. it expired). Used to give a reused
    transcript its own playback audio."""
    if config.STORAGE_DRIVER == "local":
        src = _safe_local_path(src_key)
        if not os.path.exists(src):
            return False
        dst = _safe_local_path(dst_key)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copyfile(src, dst)
        return True
    try:
        _s3().copy_object(
            Bucket=config.S3_BUCKET,
            Key=dst_key,
            CopySource={"Bucket": config.S3_BUCKET, "Key": src_key},
        )
        return True
    except Exception:
        log.warning("could not copy stored object %r -> %r", src_key, dst_key, exc_info=True)
        return False


def presign_get(key: str, expires: int = 6 * 3600) -> str:
    return _s3().generate_presigned_url(
        "get_object",
        Params={"Bucket": config.S3_BUCKET, "Key": key},
        ExpiresIn=expires,
    )


def delete_key(key: str) -> bool:
    """Best-effort delete of a stored object.

    Returns whether the object is gone. Callers keep lifecycle metadata when a
    provider error prevents deletion so a later cleanup sweep can retry.
    """
    try:
        if config.STORAGE_DRIVER == "local":
            os.remove(_safe_local_path(key))
        else:
            _s3().delete_object(Bucket=config.S3_BUCKET, Key=key)
        return True
    except FileNotFoundError:
        return True
    except Exception:
        log.warning("could not delete stored object %r", key, exc_info=True)
        return False
