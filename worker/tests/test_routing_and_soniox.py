import unittest
from unittest.mock import patch

from worker import config, routing
from worker.providers.soniox import _parse


class RoutingTests(unittest.TestCase):
    def test_default_tier_routes(self) -> None:
        with patch.object(config, "TRANSCRIBE_BACKEND", ""):
            self.assertEqual(
                routing.resolve("standard", "en"),
                ("groq", "whisper-large-v3-turbo"),
            )
            self.assertEqual(
                routing.resolve("premium", "sv"),
                ("soniox", "stt-async-v5"),
            )

    def test_language_does_not_change_standard_route(self) -> None:
        with patch.object(config, "TRANSCRIBE_BACKEND", ""):
            self.assertEqual(routing.resolve("standard", None), routing.resolve("standard", "cy"))


class SonioxParsingTests(unittest.TestCase):
    def test_groups_tokens_by_sentence_and_speaker(self) -> None:
        result = _parse(
            {
                "tokens": [
                    {"text": "Hello", "start_ms": 100, "end_ms": 500, "speaker": "1", "language": "en"},
                    {"text": " there.", "start_ms": 500, "end_ms": 3300, "speaker": "1", "language": "en"},
                    {"text": "Hi", "start_ms": 3400, "end_ms": 3700, "speaker": "2", "language": "en"},
                    {"text": "!", "start_ms": 3700, "end_ms": 3900, "speaker": "2", "language": "en"},
                ]
            }
        )

        self.assertEqual(result["language"], "en")
        self.assertEqual(
            result["segments"],
            [
                {"start": 0.1, "end": 3.3, "text": "Hello there.", "speaker": "Speaker 1"},
                {"start": 3.4, "end": 3.9, "text": "Hi!", "speaker": "Speaker 2"},
            ],
        )

    def test_flat_text_fallback(self) -> None:
        self.assertEqual(
            _parse({"text": "No token metadata"}),
            {
                "language": None,
                "segments": [{"start": 0.0, "end": 0.0, "text": "No token metadata"}],
            },
        )


if __name__ == "__main__":
    unittest.main()
