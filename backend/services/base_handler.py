from abc import ABC, abstractmethod
from typing import Any, Dict, Optional

class BaseHandler(ABC):
    @abstractmethod
    async def handle(self, *args, **kwargs) -> Optional[Dict[str, Any]]:
        """
        핸들러의 공통 인터페이스. 실제 처리 로직은 각 하위 클래스에서 구현.
        """
        pass 