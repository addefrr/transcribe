from .. import config


def get_provider():
    if config.TRANSCRIBE_BACKEND == "runpod":
        from . import runpod as provider
    elif config.TRANSCRIBE_BACKEND == "fake":
        from . import fake as provider
    else:
        from . import local as provider
    return provider
