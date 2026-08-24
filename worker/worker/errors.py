class JobError(Exception):
    """Failure with a message that is safe to show to the end user."""


class ProviderBudgetExceeded(JobError):
    """The configured global provider-spend budget has no room for a job."""

    def __init__(self):
        super().__init__(
            "This transcription is above current processing capacity. "
            "No provider request was made; try again later."
        )


class InsufficientCredits(JobError):
    def __init__(self, needed: int, balance: int):
        super().__init__(
            f"Insufficient credits: this job needs {needed} but your balance is {balance}. "
            "Buy more credits and submit again."
        )
        self.needed = needed
        self.balance = balance
