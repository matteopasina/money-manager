from abc import ABC, abstractmethod
from typing import Callable, Literal, Union
from domain import Transaction, Balance


class BaseAdapter(ABC):
    NAME: str             # shown in UI dropdown, e.g. "BBVA (Spain)"
    FILE_TYPES: list[str] # accepted extensions without dot, e.g. ["xlsx"]
    IMPORTS: Literal["transactions", "balances"]

    @abstractmethod
    def parse(
        self,
        filepath: str,
        account_id: int,
        account_currency: str,
        base_currency: str,
        get_rate: Callable[[str], float],
    ) -> list[Union[Transaction, Balance]]:
        """Parse the uploaded file and return domain objects."""
        ...

    def detect(self, filepath: str) -> bool:
        """
        Optional: return True if this file looks like it belongs to this adapter.
        Used for auto-suggestion in the import UI.
        """
        return False
