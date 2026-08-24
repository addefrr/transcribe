import os
import tempfile
import unittest
from unittest.mock import patch

from worker import config, pipeline, storage


class _Rows:
    def __init__(self, rows):
        self._rows = rows

    def fetchall(self):
        return self._rows


class _Connection:
    def __init__(self, rows):
        self.rows = rows
        self.calls = []

    def execute(self, query, params=None):
        self.calls.append((" ".join(query.split()), params))
        if len(self.calls) == 1:
            return _Rows(self.rows)
        return _Rows([])


class StorageDeletionTests(unittest.TestCase):
    def test_local_delete_reports_success_for_removed_and_missing_files(self) -> None:
        with tempfile.TemporaryDirectory() as directory, patch.object(
            config, "STORAGE_DRIVER", "local"
        ), patch.object(config, "UPLOAD_DIR", directory):
            path = os.path.join(directory, "source.ogg")
            with open(path, "wb") as handle:
                handle.write(b"audio")

            self.assertTrue(storage.delete_key("source.ogg"))
            self.assertFalse(os.path.exists(path))
            self.assertTrue(storage.delete_key("source.ogg"))

    def test_audio_sweep_keeps_pointer_when_object_deletion_fails(self) -> None:
        conn = _Connection(
            [
                {"id": "removed", "audio_key": "audio/removed.ogg"},
                {"id": "retry", "audio_key": "audio/retry.ogg"},
            ]
        )
        with patch.object(storage, "delete_key", side_effect=[True, False]):
            removed = pipeline.sweep_expired_audio(conn)

        self.assertEqual(removed, 1)
        update_calls = [call for call in conn.calls if call[0].startswith("UPDATE jobs")]
        self.assertEqual(len(update_calls), 1)
        self.assertEqual(update_calls[0][1], ("removed",))

    def test_terminal_upload_cleanup_is_requeued_after_storage_failure(self) -> None:
        conn = _Connection([])
        job = {"source_type": "upload", "upload_key": "source.ogg"}
        with patch.object(storage, "delete_key", return_value=False):
            pipeline._cleanup_source(conn, job)

        self.assertEqual(len(conn.calls), 1)
        self.assertTrue(conn.calls[0][0].startswith("UPDATE uploads SET claimed_at = NULL"))
        self.assertEqual(conn.calls[0][1], ("source.ogg",))


if __name__ == "__main__":
    unittest.main()
