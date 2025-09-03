"""
시나리오/플랜 스택 관리 시스템

이 모듈은 시나리오 간 전이, 플랜 간 전이, __END_SCENARIO__ 처리 등
모든 스택 관련 로직을 통합 관리합니다.
"""

import logging
from dataclasses import dataclass, field
from typing import Dict, Any, List, Optional, Tuple
# from services.base_handler import TransitionType  # 순환 import 방지

logger = logging.getLogger(__name__)


@dataclass
class StackFrame:
    """스택 프레임 정보"""
    scenario_name: str
    plan_name: str
    dialog_state_name: str
    last_executed_handler_index: int = -1
    entry_action_executed: bool = False
    
    # 복귀 정보 (플랜 전이 시 사용)
    return_dialog_state_name: Optional[str] = None
    return_plan_previous_name: Optional[str] = None


@dataclass
class ResumePoint:
    """복귀점 정보"""
    session_id: str
    resumed_frame: StackFrame
    scenario: Dict[str, Any]
    next_handler_index: int
    entry_action_executed: bool = False
    
    def has_more_handlers(self, handlers: List[Dict[str, Any]]) -> bool:
        """더 실행할 핸들러가 있는지 확인"""
        return self.next_handler_index < len(handlers)


class StackManager:
    """시나리오/플랜 스택 관리"""
    
    def __init__(self, scenario_manager):
        self.scenario_manager = scenario_manager
        self.session_stacks: Dict[str, List[StackFrame]] = {}
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")
    
    def initialize_session(self, session_id: str, scenario: Dict[str, Any], initial_state: str):
        """세션 스택 초기화"""
        first_plan_name = scenario.get("plan", [{}])[0].get("name", "")
        
        initial_frame = StackFrame(
            scenario_name=first_plan_name,
            plan_name="Main",  # 초기 플랜은 항상 Main
            dialog_state_name=initial_state,
            last_executed_handler_index=-1,
            entry_action_executed=False
        )
        
        self.session_stacks[session_id] = [initial_frame]
        self.logger.info(f"[STACK INIT] session={session_id}, scenario={first_plan_name}, plan=Main, state={initial_state}")
    
    def get_current_frame(self, session_id: str) -> Optional[StackFrame]:
        """현재 스택 프레임 조회"""
        stack = self.session_stacks.get(session_id, [])
        return stack[-1] if stack else None
    
    def get_stack_info(self, session_id: str) -> Dict[str, Any]:
        """현재 스택 정보 반환 (기존 get_current_scenario_info 호환)"""
        frame = self.get_current_frame(session_id)
        if not frame:
            return {}
        
        return {
            "scenarioName": frame.scenario_name,
            "planName": frame.plan_name,
            "dialogStateName": frame.dialog_state_name,
            "lastExecutedHandlerIndex": frame.last_executed_handler_index,
            "entryActionExecuted": frame.entry_action_executed
        }
    
    def update_current_state(self, session_id: str, new_state: str):
        """현재 상태 업데이트"""
        frame = self.get_current_frame(session_id)
        if frame:
            frame.dialog_state_name = new_state
            self.logger.debug(f"[STACK UPDATE] session={session_id}, new_state={new_state}")
    
    def update_handler_index(self, session_id: str, handler_index: int):
        """마지막 실행된 핸들러 인덱스 업데이트"""
        frame = self.get_current_frame(session_id)
        if frame:
            frame.last_executed_handler_index = handler_index
            self.logger.debug(f"[STACK UPDATE] session={session_id}, handler_index={handler_index}")
    
    def switch_to_scenario(
        self, 
        session_id: str, 
        target_scenario_name: str, 
        target_state: str, 
        handler_index: int = -1, 
        current_state: str = None
    ) -> StackFrame:
        """다른 시나리오로 전이"""
        stack = self.session_stacks.get(session_id, [])
        current_frame = stack[-1] if stack else None
        
        if current_frame:
            # 현재 프레임에 복귀 정보 저장
            current_frame.last_executed_handler_index = handler_index
            current_frame.entry_action_executed = True
            if current_state:
                current_frame.dialog_state_name = current_state
        
        # 새로운 시나리오 프레임 추가
        new_frame = StackFrame(
            scenario_name=target_scenario_name,
            plan_name=target_scenario_name,
            dialog_state_name=target_state or "Start",
            last_executed_handler_index=-1,
            entry_action_executed=False
        )
        
        stack.append(new_frame)
        self.session_stacks[session_id] = stack
        
        self.logger.info(f"[SCENARIO SWITCH] {current_frame.scenario_name if current_frame else 'Unknown'} -> {target_scenario_name} (state: {new_frame.dialog_state_name})")
        
        return new_frame
    
    def switch_to_plan(
        self, 
        session_id: str, 
        target_plan_name: str, 
        target_state: str, 
        handler_index: int = -1,
        current_state: str = None
    ) -> StackFrame:
        """플랜 전이 (동일 시나리오 내)"""
        stack = self.session_stacks.get(session_id, [])
        current_frame = stack[-1] if stack else None
        
        if not current_frame:
            # 현재 프레임이 없으면 새로 생성 (초기 상태)
            self.logger.warning(f"No current frame for session {session_id}, creating new frame")
            new_frame = StackFrame(
                scenario_name=target_plan_name,  # 기본값으로 target_plan_name 사용
                plan_name=target_plan_name,
                dialog_state_name=target_state,
                last_executed_handler_index=-1,
                entry_action_executed=False
            )
            
            self.session_stacks[session_id] = [new_frame]
            self.logger.info(f"[PLAN SWITCH] Created new frame for session {session_id}: {target_plan_name} -> {target_state}")
            return new_frame
        
        # 현재 플랜과 다른 경우에만 새 프레임 추가
        if target_plan_name != current_frame.plan_name:
            # 🚀 수정: 플랜 전이 시 현재 프레임을 보존하고 새 프레임 추가
            # 현재 프레임에 복귀 정보 저장
            current_frame.last_executed_handler_index = handler_index
            if current_state:
                current_frame.dialog_state_name = current_state
            
            # 새로운 플랜 프레임 추가 (이전 프레임 보존)
            new_frame = StackFrame(
                scenario_name=current_frame.scenario_name,
                plan_name=target_plan_name,
                dialog_state_name=target_state,
                last_executed_handler_index=-1,
                entry_action_executed=False
            )
            
            stack.append(new_frame)
            self.session_stacks[session_id] = stack
            
            self.logger.info(f"[PLAN SWITCH] {current_frame.plan_name} -> {target_plan_name} (state: {target_state}) - Previous frame preserved")
            return new_frame
        else:
            # 🚀 수정: 같은 플랜 내에서도 새 프레임 추가 (__END_SCENARIO__ 복귀를 위해)
            # 현재 프레임에 복귀 정보 저장
            current_frame.last_executed_handler_index = handler_index
            if current_state:
                current_frame.dialog_state_name = current_state
            
            # 새로운 상태 프레임 추가
            new_frame = StackFrame(
                scenario_name=current_frame.scenario_name,
                plan_name=target_plan_name,
                dialog_state_name=target_state,
                last_executed_handler_index=-1,
                entry_action_executed=False
            )
            
            stack.append(new_frame)
            self.session_stacks[session_id] = stack
            
            self.logger.info(f"[PLAN SWITCH] Same plan but new state: {current_frame.plan_name} -> {target_plan_name} (state: {current_frame.dialog_state_name} -> {target_state})")
            return new_frame
    
    def handle_end_scenario(self, session_id: str) -> Optional[ResumePoint]:
        """__END_SCENARIO__ 처리
        
        동작:
        1. 현재 프레임을 스택에서 제거
        2. 동일 플랜의 중복 프레임이 존재하면 모두 제거하여 상위 플랜/시나리오로 복귀
        3. 이전 프레임의 handler index 정보를 가져와서 다음 handler부터 실행
        4. 이미 실행된 entry action은 건너뛰기
        """
        stack = self.session_stacks.get(session_id, [])
        
        if len(stack) <= 1:
            self.logger.warning(f"Cannot end scenario: only one frame in stack for session {session_id}")
            return None
        
        # 현재 프레임 제거
        ended_frame = stack.pop()

        # 동일 플랜의 중복 프레임을 모두 제거하여 상위로 복귀
        removed_count = 0
        while stack and stack[-1].plan_name == ended_frame.plan_name:
            stack.pop()
            removed_count += 1
        if removed_count > 0:
            self.logger.info(f"[END_SCENARIO] Collapsed {removed_count} duplicate frame(s) of plan '{ended_frame.plan_name}'")
        
        if not stack:
            self.logger.warning(f"[END_SCENARIO] Stack became empty after collapsing for session {session_id}")
            return None
        
        previous_frame = stack[-1]
        
        self.logger.info(f"[END_SCENARIO] {ended_frame.scenario_name} -> returning to {previous_frame.scenario_name}")
        self.logger.info(f"[END_SCENARIO] Previous frame: plan={previous_frame.plan_name}, state={previous_frame.dialog_state_name}, handler_index={previous_frame.last_executed_handler_index}")
        
        # 시나리오 객체 로드
        # 🚀 수정: 현재 세션의 전체 시나리오를 사용 (Scene1은 플랜이므로)
        scenario = self.scenario_manager.get_scenario(session_id)
        if not scenario:
            self.logger.error(f"Cannot find scenario for session: {session_id}")
            return None
        
        # 다음 핸들러 인덱스 계산 (이전에 실행된 핸들러 다음부터)
        next_handler_index = previous_frame.last_executed_handler_index + 1
        
        # Entry Action이 이미 실행되었는지 확인
        entry_action_executed = previous_frame.entry_action_executed
        
        resume_point = ResumePoint(
            session_id=session_id,
            resumed_frame=previous_frame,
            scenario=scenario,
            next_handler_index=next_handler_index,
            entry_action_executed=entry_action_executed
        )
        
        self.logger.info(f"[END_SCENARIO] Resume point created: next_handler_index={next_handler_index}, entry_action_executed={entry_action_executed}")
        
        return resume_point
    
    def find_dialog_state_for_session(
        self, 
        session_id: str, 
        scenario: Dict[str, Any], 
        state_name: str
    ) -> Optional[Dict[str, Any]]:
        """세션의 현재 플랜 컨텍스트에서 Dialog State 찾기"""
        frame = self.get_current_frame(session_id)
        if not frame:
            # Fallback: no stack frame managed by this engine; find state globally
            try:
                found = self.scenario_manager.find_dialog_state(scenario, state_name)
                return found
            except Exception:
                return None
        
        plan_name = frame.plan_name
        
        # 1) 현재 플랜에서 먼저 검색 (top-level plan)
        for pl in scenario.get("plan", []):
            if pl.get("name") == plan_name:
                for ds in pl.get("dialogState", []):
                    if ds.get("name") == state_name:
                        return ds
                break
        
        # 2) 현재 플랜이 nested plan일 경우 그 내부에서 검색
        for top_pl in scenario.get("plan", []):
            for ds in top_pl.get("dialogState", []):
                if ds.get("name") == plan_name and isinstance(ds.get("dialogState"), list):
                    for nested_ds in ds.get("dialogState", []):
                        if nested_ds.get("name") == state_name:
                            return nested_ds
                    break
        
        # 3) 모든 플랜에서 fallback 검색
        found = self.scenario_manager.find_dialog_state(scenario, state_name)
        if found:
            return found
        
        # 4) 중첩 구조도 순회해서 검색
        for top_pl in scenario.get("plan", []):
            for ds in top_pl.get("dialogState", []):
                if isinstance(ds.get("dialogState"), list):
                    for nested_ds in ds.get("dialogState", []):
                        if nested_ds.get("name") == state_name:
                            return nested_ds
        
        return None
    
    def is_plan_name(self, scenario: Dict[str, Any], name: Optional[str]) -> bool:
        """주어진 이름이 플랜명인지 확인"""
        if not name:
            return False
        
        try:
            # 1) top-level plans
            if any(pl.get("name") == name for pl in scenario.get("plan", [])):
                return True
            
            # 2) nested plan-as-state
            for top_pl in scenario.get("plan", []):
                for ds in top_pl.get("dialogState", []):
                    if ds.get("name") == name and isinstance(ds.get("dialogState"), list):
                        return True
            
            return False
        except Exception:
            return False
    
    def get_start_state_of_plan(self, scenario: Dict[str, Any], plan_name: str) -> Optional[str]:
        """플랜의 시작 상태 조회"""
        # top-level plans
        for pl in scenario.get("plan", []):
            if pl.get("name") == plan_name:
                states = pl.get("dialogState", [])
                for st in states:
                    if st.get("name") == "Start":
                        return "Start"
                return states[0].get("name") if states else None
        
        # nested plan-as-state
        for top_pl in scenario.get("plan", []):
            for ds in top_pl.get("dialogState", []):
                if ds.get("name") == plan_name and isinstance(ds.get("dialogState"), list):
                    nested_states = ds.get("dialogState", [])
                    for st in nested_states:
                        if st.get("name") == "Start":
                            return "Start"
                    return nested_states[0].get("name") if nested_states else None
        
        return None
    
    def get_stack_debug_info(self, session_id: str) -> Dict[str, Any]:
        """디버깅용 스택 정보"""
        stack = self.session_stacks.get(session_id, [])
        return {
            "session_id": session_id,
            "stack_depth": len(stack),
            "frames": [
                {
                    "scenario": frame.scenario_name,
                    "plan": frame.plan_name,
                    "state": frame.dialog_state_name,
                    "handler_index": frame.last_executed_handler_index,
                    "entry_executed": frame.entry_action_executed
                }
                for frame in stack
            ]
        }
