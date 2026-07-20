from ..errors import JobError

_BACKENDS = {"groq", "assemblyai", "local", "fake"}


def get_provider(name: str):
    """Resolve a transcription backend by name to its provider module."""
    if name == "groq":
        from . import groq as provider
    elif name == "assemblyai":
        from . import assemblyai as provider
    elif name == "local":
        from . import local as provider
    elif name == "fake":
        from . import fake as provider
    else:
        raise JobError(f"Unknown transcription backend {name!r}.")
    return provider
