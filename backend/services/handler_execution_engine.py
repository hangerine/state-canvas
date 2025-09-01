"""
Handler 실행 엔진

이 모듈은 모든 Handler의 실행을 통합 관리하며, 표준화된 상태 전이 로직을 제공합니다.
기존 state_engine.py의 복잡한 로직을 대체하는 새로운 아키텍처의 핵심입니다.
"""

import logging
from typing import Dict, Any, List, Optional
from .base_handler import (
    BaseHandler, HandlerRegistry, ExecutionContext, HandlerResult, 
    StateExecutionResult, HandlerType, TransitionType
)
from .stack_manager import StackManager, ResumePoint, StackFrame

logger = logging.getLogger(__name__)


class HandlerExecutionEngine:
    """Handler 실행을 담당하는 핵심 엔진"""
    
    # 🚀 전이 플래그 캐시
    _transition_cache: Dict[str, bool] = {}

    def __init__(self, scenario_manager, action_executor, state_engine=None):
        self.scenario_manager = scenario_manager
        self.action_executor = action_executor
        self.state_engine = state_engine  # 🚀 StateEngine 참조 추가
        self.stack_manager = StackManager(scenario_manager)
        self.handler_registry = HandlerRegistry()
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")
        
        # 최대 실행 깊이 (무한 루프 방지)
        self.max_execution_depth = 10
    
    # 🚀 전이 플래그 관리 메서드들
    @classmethod
    def set_transition_flag(cls, session_id: str):
        """세션에 전이 플래그 설정"""
        cls._transition_cache[session_id] = True
    
    @classmethod
    def get_transition_flag(cls, session_id: str) -> bool:
        """세션의 전이 플래그 확인"""
        return cls._transition_cache.get(session_id, False)
    
    @classmethod
    def clear_transition_flag(cls, session_id: str):
        """세션의 전이 플래그 제거"""
        if session_id in cls._transition_cache:
            del cls._transition_cache[session_id]
    
    def register_handler(self, handler: BaseHandler):
        """Handler 등록"""
        self.handler_registry.register_handler(handler)
    
    async def execute_state_cycle(
        self,
        session_id: str,
        current_state: str,
        scenario: Dict[str, Any],
        memory: Dict[str, Any],
        user_input: Optional[str] = None
    ) -> StateExecutionResult:
        """표준화된 상태 실행 사이클"""
        
        self.logger.info(f"[EXECUTION] 🚨 execute_state_cycle 메서드 시작!")
        self.logger.info(f"[EXECUTION] 🔍 session_id: {session_id}")
        self.logger.info(f"[EXECUTION] 🔍 current_state: {current_state}")
        self.logger.info(f"[EXECUTION] 🔍 scenario: {scenario.get('plan', []) if scenario else 'None'}")
        
        self.logger.info(f"[EXECUTION] Starting state cycle: session={session_id}, state={current_state}")
        
        # 실행 컨텍스트 생성
        context = await self._create_execution_context(
            session_id, current_state, scenario, memory, user_input
        )
        
        # 실행 결과 초기화
        result = StateExecutionResult(
            final_state=current_state,
            updated_memory=memory.copy()
        )
        
        # 최대 깊이 추적
        execution_depth = memory.get("_EXECUTION_DEPTH", 0)
        if execution_depth >= self.max_execution_depth:
            self.logger.warning(f"Maximum execution depth reached: {execution_depth}")
            return result
        
        memory["_EXECUTION_DEPTH"] = execution_depth + 1
        
        try:
            # Handler 실행 사이클
            await self._execute_handler_cycle(context, result)
            
        except Exception as e:
            self.logger.error(f"Error in state execution cycle: {e}", exc_info=True)
            result.response_messages.append(f"❌ 실행 중 오류 발생: {str(e)}")
        
        finally:
            # 실행 깊이 정리
            memory["_EXECUTION_DEPTH"] = execution_depth
        
        return result
    
    async def _create_execution_context(
        self, 
        session_id: str, 
        current_state: str, 
        scenario: Dict[str, Any], 
        memory: Dict[str, Any],
        user_input: Optional[str] = None
    ) -> ExecutionContext:
        """실행 컨텍스트 생성"""
        
        # 현재 Dialog State 조회 - 현재 활성 플랜을 우선적으로 고려
        current_dialog_state = None
        self.logger.info(f"[CONTEXT DEBUG] Starting _create_execution_context for state: {current_state}")
        
        # 🚀 현재 활성 플랜 확인
        current_plan = None
        try:
            current_frame = self.stack_manager.get_current_frame(session_id)
            self.logger.info(f"[CONTEXT DEBUG] Stack frame for session {session_id}: {current_frame}")
            if current_frame:
                current_plan = current_frame.plan_name
                self.logger.info(f"[CONTEXT DEBUG] Current active plan from stack: {current_plan}")
            else:
                self.logger.warning(f"[CONTEXT DEBUG] No current frame found for session {session_id}")
        except Exception as e:
            self.logger.warning(f"[CONTEXT DEBUG] Could not get current plan from stack: {e}")
        
        # 현재 활성 플랜에서 먼저 검색
        if current_plan:
            self.logger.info(f"[CONTEXT DEBUG] Searching in current active plan: {current_plan}")
            for plan in scenario.get("plan", []):
                if plan.get("name") == current_plan:
                    self.logger.info(f"[CONTEXT DEBUG] Found matching plan: {plan.get('name')}")
                    for dialog_state in plan.get("dialogState", []):
                        if dialog_state.get("name") == current_state:
                            current_dialog_state = dialog_state
                            self.logger.info(f"[CONTEXT DEBUG] Found state '{current_state}' in active plan '{current_plan}'")
                            break
                    break
            if not current_dialog_state:
                self.logger.warning(f"[CONTEXT DEBUG] State '{current_state}' not found in active plan '{current_plan}'")
        
        # 🚀 메모리에서 플랜 정보 확인 (테스트용)
        memory_plan = memory.get("_CURRENT_PLAN")
        if memory_plan:
            self.logger.info(f"[CONTEXT DEBUG] Plan from memory: {memory_plan}")
            if not current_plan:
                current_plan = memory_plan
                self.logger.info(f"[CONTEXT DEBUG] Using plan from memory: {current_plan}")
        
        # 현재 활성 플랜에서 먼저 검색
        if current_plan:
            self.logger.info(f"[CONTEXT DEBUG] Searching in current active plan: {current_plan}")
            for plan in scenario.get("plan", []):
                if plan.get("name") == current_plan:
                    self.logger.info(f"[CONTEXT DEBUG] Found matching plan: {plan.get('name')}")
                    for dialog_state in plan.get("dialogState", []):
                        if dialog_state.get("name") == current_state:
                            current_dialog_state = dialog_state
                            self.logger.info(f"[CONTEXT DEBUG] Found state '{current_state}' in active plan '{current_plan}'")
                            break
                    break
            if not current_dialog_state:
                self.logger.warning(f"[CONTEXT DEBUG] State '{current_state}' not found in active plan '{current_plan}'")
        
        # 현재 활성 플랜에서 찾지 못한 경우 모든 플랜에서 검색
        if not current_dialog_state:
            self.logger.info(f"[CONTEXT DEBUG] State not found in active plan, searching all plans")
            self.logger.info(f"[CONTEXT DEBUG] Calling find_dialog_state for state: {current_state}")
            self.logger.info(f"[CONTEXT DEBUG] Scenario plans: {[plan.get('name', 'Unknown') for plan in scenario.get('plan', [])]}")
            
            # 🚀 핵심 수정: 현재 활성 플랜을 전달하여 우선적으로 검색
            current_dialog_state = self.scenario_manager.find_dialog_state(scenario, current_state, current_plan)
            
            if current_dialog_state:
                self.logger.info(f"[CONTEXT DEBUG] find_dialog_state returned: {current_dialog_state}")
                # 🚀 로그 개선: 어떤 플랜에서 상태를 찾았는지 표시
                found_plan = "Unknown"
                for plan in scenario.get("plan", []):
                    for dialog_state in plan.get("dialogState", []):
                        if dialog_state.get("name") == current_state:
                            found_plan = plan.get("name", "Unknown")
                            break
                    if found_plan != "Unknown":
                        break
                self.logger.info(f"[CONTEXT DEBUG] find_dialog_state result for '{current_state}': {found_plan}.{current_state}")
            else:
                self.logger.error(f"[CONTEXT DEBUG] State '{current_state}' not found in any plan")
        
        # 새 요청 시작 시에는 기본적으로 유예 없음 (동일 요청 내 전이에서만 유예 적용)
        intent_deferred = False
        
        context = ExecutionContext(
            session_id=session_id,
            current_state=current_state,
            scenario=scenario,
            memory=memory,
            user_input=user_input,
            current_dialog_state=current_dialog_state,
            intent_deferred=intent_deferred
        )
        
        # 🚀 디버깅: ExecutionContext 생성 결과 로깅
        self.logger.info(f"[CONTEXT DEBUG] Created context:")
        self.logger.info(f"  - current_state: {current_state}")
        self.logger.info(f"  - user_input: '{user_input}'")
        self.logger.info(f"  - has_user_input: {bool(user_input)}")
        self.logger.info(f"  - current_dialog_state: {current_dialog_state.get('name') if current_dialog_state else 'None'}")
        self.logger.info(f"  - intent_deferred: {memory.get('_INTENT_DEFERRED', False)}")
        
        return context
    
    async def _execute_handler_cycle(self, context: ExecutionContext, result: StateExecutionResult):
        """Handler 실행 사이클"""
        
        current_state = context.current_state
        execution_count = 0
        max_cycles = 5  # 무한 루프 방지
        
        while execution_count < max_cycles:
            execution_count += 1
            self.logger.info(f"[CYCLE {execution_count}] Executing handlers for state: {current_state}")
            
            # 현재 상태에서 실행 가능한 Handler들 조회
            executable_handlers = await self.handler_registry.get_executable_handlers(context)
            
            # 🚀 디버깅: 실행 가능한 Handler들 로깅
            self.logger.info(f"[CYCLE {execution_count}] Available handlers: {[h.handler_type for h in executable_handlers]}")
            
            if not executable_handlers:
                self.logger.info(f"[CYCLE {execution_count}] No executable handlers found")
                break
            
            # Handler들을 순서대로 실행
            cycle_completed = True
            for handler in executable_handlers:
                self.logger.info(f"[CYCLE {execution_count}] Executing {handler.handler_type}")
                
                # 🚀 디버깅: ConditionHandlerV2 실행 확인
                if handler.handler_type == HandlerType.CONDITION:
                    self.logger.info(f"[CYCLE {execution_count}] 🚨 ConditionHandlerV2 실행 시작")
                    self.logger.info(f"[CYCLE {execution_count}] 🚨 현재 context 상태:")
                    self.logger.info(f"[CYCLE {execution_count}]   - current_state: {context.current_state}")
                    self.logger.info(f"[CYCLE {execution_count}]   - current_dialog_state: {context.current_dialog_state}")
                    self.logger.info(f"[CYCLE {execution_count}]   - scenario: {context.scenario.get('plan', []) if context.scenario else 'None'}")
                    
                    # 🚀 핵심 수정: ConditionHandlerV2 실행 시 새로운 컨텍스트 생성
                    if context.current_dialog_state is None:
                        self.logger.info(f"[CYCLE {execution_count}] 🚨 current_dialog_state가 None이므로 새로운 컨텍스트 생성")
                        new_context = await self._create_execution_context(
                            context.session_id,
                            context.current_state,
                            context.scenario,
                            context.memory,
                            context.user_input
                        )
                        context.current_dialog_state = new_context.current_dialog_state
                        self.logger.info(f"[CYCLE {execution_count}] 🚨 새로운 컨텍스트 생성 완료: {context.current_dialog_state.get('name') if context.current_dialog_state else 'None'}")
                
                try:
                    handler_result = await handler.execute(context)
                    
                    # 결과 병합
                    self._merge_handler_result(result, handler_result)
                    result.executed_handlers.append(handler.handler_type)
                    
                    # 전이 처리
                    if handler_result.transition_type != TransitionType.NO_TRANSITION:
                        new_state = await self._handle_transition(context, handler_result)
                        
                        if new_state != current_state:
                            # 상태가 변경된 경우
                            current_state = new_state
                            result.final_state = new_state
                            
                            # 컨텍스트 업데이트
                            context = await self._update_context_for_new_state(
                                context, new_state
                            )
                            
                            # 🚀 핵심 수정: 전이가 발생했으면 현재 사이클을 중단하고 사용자 입력을 기다림
                            self.logger.info(f"[CYCLE {execution_count}] State transition occurred: {context.current_state} -> {new_state}")
                            self.logger.info(f"[CYCLE {execution_count}] Breaking cycle to wait for user input")
                            result.needs_user_input = True
                            cycle_completed = False
                            break
                    
                    # Handler가 실행 중단을 요청하는 경우
                    self.logger.info(f"[CYCLE {execution_count}] Checking should_stop_execution for {handler.handler_type}")
                    self.logger.info(f"[CYCLE {execution_count}] handler_result.success: {handler_result.success}")
                    self.logger.info(f"[CYCLE {execution_count}] handler_result.transition_type: {handler_result.transition_type}")
                    
                    if handler.should_stop_execution(handler_result):
                        self.logger.info(f"[CYCLE {execution_count}] Handler {handler.handler_type} requested execution stop")
                        result.execution_stopped_at = handler.handler_type
                        result.needs_user_input = (handler.handler_type == HandlerType.INTENT)
                        cycle_completed = False
                        break
                    else:
                        self.logger.info(f"[CYCLE {execution_count}] Handler {handler.handler_type} did not request execution stop")
                
                except Exception as e:
                    self.logger.error(f"Error executing handler {handler.handler_type}: {e}")
                    result.response_messages.append(f"⚠️ {handler.handler_type} 실행 중 오류: {str(e)}")
            
            # 사이클이 완료되었고 상태 변경이 없으면 종료
            if cycle_completed and result.final_state == current_state:
                break
        
        if execution_count >= max_cycles:
            self.logger.warning(f"Maximum execution cycles reached: {max_cycles}")
    
    def _merge_handler_result(self, result: StateExecutionResult, handler_result: HandlerResult):
        """Handler 결과를 전체 결과에 병합"""
        result.response_messages.extend(handler_result.messages)
        result.transitions.extend(handler_result.transitions)
        
        if handler_result.updated_memory:
            result.updated_memory.update(handler_result.updated_memory)
    
    async def _handle_transition(self, context: ExecutionContext, handler_result: HandlerResult) -> str:
        """전이 처리"""
        
        if handler_result.transition_type == TransitionType.STATE_TRANSITION:
            # 일반 상태 전이
            new_state = handler_result.new_state
            self.stack_manager.update_current_state(context.session_id, new_state)
            
            # Entry Action 실행
            await self._execute_entry_action(context.scenario, new_state, handler_result)
            
            # 🚀 핵심 수정: 전역 캐시에 전이 플래그 설정
            # 이는 다음 상태에서 즉시 intent 처리를 방지하기 위함
            self.set_transition_flag(context.session_id)
            self.logger.info(f"[TRANSITION] Set transition flag in global cache for session: {context.session_id}, new state: {new_state}")
            
            # 🚀 기존 시스템과 동일한 로직: intentHandlers가 있으면 자동 전이 스킵
            if hasattr(self.scenario_manager, 'find_dialog_state'):
                new_dialog_state = self.scenario_manager.find_dialog_state(context.scenario, new_state)
                if new_dialog_state and new_dialog_state.get("intentHandlers"):
                    self.logger.info(f"[AUTO TRANSITION] Skipped due to intentHandlers present in state '{new_state}' - waiting for user input")
                    # Intent Handler가 있는 상태에서는 자동 전이 중단
                    return new_state
            
            return new_state
        
        elif handler_result.transition_type == TransitionType.SCENARIO_TRANSITION:
            # 시나리오 전이 (실제로는 plan 전이)
            target_scenario = handler_result.target_scenario
            new_state = handler_result.new_state
            
            if not target_scenario or not new_state:
                self.logger.error(f"[SCENARIO TRANSITION] Invalid transition: target_scenario={target_scenario}, new_state={new_state}")
                return context.current_state
            
            # 🚀 디버깅: stack_manager 상태 확인
            self.logger.info(f"[SCENARIO TRANSITION] Before switch_to_plan:")
            self.logger.info(f"[SCENARIO TRANSITION]   - session_id: {context.session_id}")
            self.logger.info(f"[SCENARIO TRANSITION]   - session_stacks keys: {list(self.stack_manager.session_stacks.keys())}")
            self.logger.info(f"[SCENARIO TRANSITION]   - current stack: {self.stack_manager.session_stacks.get(context.session_id, [])}")
            
            try:
                # 🚀 핵심 수정: plan 전이로 처리
                self.stack_manager.switch_to_plan(
                    context.session_id,
                    target_scenario,  # target_scenario는 실제로는 plan 이름
                    new_state,
                    handler_result.handler_index or -1,
                    context.current_state
                )
                
                # 🚀 핵심 수정: 같은 시나리오 내에서 plan만 변경
                self.logger.info(f"[PLAN TRANSITION] Switching to plan: {target_scenario}")
                
            except Exception as e:
                self.logger.error(f"[SCENARIO TRANSITION] Error in switch_to_plan: {e}")
                # 🚀 대안: 직접 스택 업데이트
                self.logger.info(f"[SCENARIO TRANSITION] Fallback: direct stack update")
                if context.session_id not in self.stack_manager.session_stacks:
                    self.stack_manager.session_stacks[context.session_id] = []
                
                new_frame = StackFrame(
                    scenario_name="Main",  # 기본값
                    plan_name=target_scenario,
                    dialog_state_name=new_state,
                    last_executed_handler_index=handler_result.handler_index or -1,
                    entry_action_executed=False
                )
                self.stack_manager.session_stacks[context.session_id].append(new_frame)
            
            return new_state
        
        elif handler_result.transition_type == TransitionType.PLAN_TRANSITION:
            # 플랜 전이
            self.logger.info(f"[PLAN TRANSITION] 🚨 PLAN_TRANSITION 블록 실행됨!")
            target_plan = handler_result.target_plan
            new_state = handler_result.new_state
            
            if not target_plan or not new_state:
                self.logger.error(f"[PLAN TRANSITION] Invalid transition: target_plan={target_plan}, new_state={new_state}")
                return context.current_state
            
            # 🚀 디버깅: stack_manager 상태 확인
            self.logger.info(f"[PLAN TRANSITION] Before switch_to_plan:")
            self.logger.info(f"[PLAN TRANSITION]   - session_id: {context.session_id}")
            self.logger.info(f"[PLAN TRANSITION]   - session_stacks keys: {list(self.stack_manager.session_stacks.keys())}")
            self.logger.info(f"[PLAN TRANSITION]   - current stack: {self.stack_manager.session_stacks.get(context.session_id, [])}")
            
            try:
                # 🚀 핵심 수정: plan 전이로 처리
                self.stack_manager.switch_to_plan(
                    context.session_id,
                    target_plan,
                    new_state,
                    handler_result.handler_index or -1,
                    context.current_state
                )
                
                # 🚀 핵심 수정: 같은 시나리오 내에서 plan만 변경
                self.logger.info(f"[PLAN TRANSITION] Switching to plan: {target_plan}")
                
            except Exception as e:
                self.logger.error(f"[PLAN TRANSITION] Error in switch_to_plan: {e}")
                # 🚀 대안: 직접 스택 업데이트
                self.logger.info(f"[PLAN TRANSITION] Fallback: direct stack update")
                if context.session_id not in self.stack_manager.session_stacks:
                    self.stack_manager.session_stacks[context.session_id] = []
                
                # 🚨 디버깅: fallback 로직에서 사용되는 값들 확인
                self.logger.info(f"[PLAN TRANSITION] Fallback debug:")
                self.logger.info(f"[PLAN TRANSITION]   - target_plan: {target_plan}")
                self.logger.info(f"[PLAN TRANSITION]   - new_state: {new_state}")
                self.logger.info(f"[PLAN TRANSITION]   - handler_result.target_plan: {handler_result.target_plan}")
                self.logger.info(f"[PLAN TRANSITION]   - handler_result.new_state: {handler_result.new_state}")
                
                new_frame = StackFrame(
                    scenario_name=target_plan,  # target_plan을 scenario_name으로 사용
                    plan_name=target_plan,
                    dialog_state_name=new_state,
                    last_executed_handler_index=handler_result.handler_index or -1,
                    entry_action_executed=False
                )
                
                self.logger.info(f"[PLAN TRANSITION] Created StackFrame:")
                self.logger.info(f"[PLAN TRANSITION]   - scenario_name: {new_frame.scenario_name}")
                self.logger.info(f"[PLAN TRANSITION]   - plan_name: {new_frame.plan_name}")
                self.logger.info(f"[PLAN TRANSITION]   - dialog_state_name: {new_frame.dialog_state_name}")
                self.stack_manager.session_stacks[context.session_id].append(new_frame)
                
                # 🚨 새로운 플랜의 컨텍스트 로드
                self.logger.info(f"[PLAN TRANSITION] 새로운 플랜 컨텍스트 로드: {target_plan}")
                try:
                    # 새로운 시나리오 로드 (플랜 전환)
                    self.logger.info(f"[PLAN TRANSITION] 🔍 현재 context.scenario 구조:")
                    self.logger.info(f"[PLAN TRANSITION]   - type: {type(context.scenario)}")
                    self.logger.info(f"[PLAN TRANSITION]   - keys: {list(context.scenario.keys()) if isinstance(context.scenario, dict) else 'N/A'}")
                    
                    self.scenario_manager.load_scenario(context.session_id, context.scenario)
                    
                    # 컨텍스트 업데이트 - target_plan으로 전환
                    self.logger.info(f"[PLAN TRANSITION] 🔍 load_scenario 후 context.scenario 구조:")
                    self.logger.info(f"[PLAN TRANSITION]   - type: {type(context.scenario)}")
                    self.logger.info(f"[PLAN TRANSITION]   - keys: {list(context.scenario.keys()) if isinstance(context.scenario, dict) else 'N/A'}")
                    
                    if isinstance(context.scenario, dict) and "plan" in context.scenario:
                        plans = context.scenario.get("plan", [])
                        self.logger.info(f"[PLAN TRANSITION] 🔍 사용 가능한 플랜들:")
                        for i, plan in enumerate(plans):
                            plan_name = plan.get("name", "Unknown")
                            self.logger.info(f"[PLAN TRANSITION]   - 플랜 {i}: {plan_name}")
                        
                        target_plan_data = None
                        for plan in plans:
                            if plan.get("name") == target_plan:
                                target_plan_data = plan
                                self.logger.info(f"[PLAN TRANSITION] ✅ {target_plan} 플랜을 찾았습니다!")
                                break
                        
                        if target_plan_data:
                            # 새로운 플랜의 컨텍스트로 업데이트
                            context.scenario = {"plan": [target_plan_data]}
                            self.logger.info(f"[PLAN TRANSITION] 새로운 플랜 컨텍스트 로드 완료: {target_plan}")
                        else:
                            self.logger.error(f"[PLAN TRANSITION] ❌ {target_plan} 플랜을 찾을 수 없습니다")
                            self.logger.error(f"[PLAN TRANSITION] ❌ 사용 가능한 플랜들: {[plan.get('name', 'Unknown') for plan in plans]}")
                    else:
                        self.logger.error(f"[PLAN TRANSITION] ❌ context.scenario에 'plan' 키가 없습니다")
                        self.logger.error(f"[PLAN TRANSITION] ❌ context.scenario: {context.scenario}")
                        
                except Exception as e:
                    self.logger.error(f"[PLAN TRANSITION] 새로운 플랜 컨텍스트 로드 중 오류: {e}")
                    import traceback
                    self.logger.error(f"[PLAN TRANSITION] 상세 오류: {traceback.format_exc()}")
            
            return new_state
        
        elif handler_result.transition_type == TransitionType.END_SCENARIO:
            # __END_SCENARIO__ 처리
            return await self._handle_end_scenario(context, handler_result)
        
        return context.current_state
    
    async def _handle_end_scenario(self, context: ExecutionContext, handler_result: HandlerResult) -> str:
        """__END_SCENARIO__ 처리 - 스택에서 복귀하여 다음 핸들러 실행"""
        
        self.logger.info(f"[END_SCENARIO] 시나리오 종료 감지: {context.session_id}")
        
        resume_point = self.stack_manager.handle_end_scenario(context.session_id)
        if not resume_point:
            self.logger.warning("Cannot resume from stack - no previous frame")
            return "__END_SESSION__"
        
        self.logger.info(f"[END_SCENARIO] 복귀 대상: {resume_point.resumed_frame.dialog_state_name}, 다음 핸들러 인덱스: {resume_point.next_handler_index}")
        
        # 복귀 상태에서 다음 핸들러부터 계속 실행
        next_state = await self._resume_from_stack(resume_point, handler_result, context)
        
        return next_state or resume_point.resumed_frame.dialog_state_name
    
    async def _resume_from_stack(self, resume_point: ResumePoint, handler_result: HandlerResult, original_context: ExecutionContext) -> str:
        """스택에서 복귀하여 다음 핸들러부터 실행"""
        
        # 시나리오에서 직접 dialog state 찾기 (fallback 방식 사용)
        dialog_state = None
        for plan in resume_point.scenario.get("plan", []):
            for ds in plan.get("dialogState", []):
                if ds.get("name") == resume_point.resumed_frame.dialog_state_name:
                    dialog_state = ds
                    break
            if dialog_state:
                break
        
        if not dialog_state:
            self.logger.warning(f"Cannot find dialog state: {resume_point.resumed_frame.dialog_state_name}")
            return None
        
        # 다음 핸들러부터 평가
        handlers = dialog_state.get("conditionHandlers", [])
        
        if not resume_point.has_more_handlers(handlers):
            self.logger.info("No more handlers to execute after resume")
            return None
        
        self.logger.info(f"[RESUME] 복귀 후 핸들러 평가: {resume_point.resumed_frame.dialog_state_name}")
        self.logger.info(f"[RESUME] 다음 핸들러 인덱스: {resume_point.next_handler_index} / 전체: {len(handlers)}")
        
        # 새로운 ConditionHandler를 사용하여 조건 평가 (우선순위 적용)
        try:
            from .concrete_handlers import ConditionHandlerV2
            from .transition_manager import TransitionManager
            
            transition_manager = TransitionManager(self.scenario_manager)
            condition_handler = ConditionHandlerV2(transition_manager)
            
            # ExecutionContext 생성
            resume_context = ExecutionContext(
                session_id=resume_point.session_id,
                current_state=resume_point.resumed_frame.dialog_state_name,
                scenario=resume_point.scenario,
                memory=original_context.memory,  # 원본 메모리 사용
                user_input=original_context.user_input,
                current_dialog_state=dialog_state,
                intent_deferred=False
            )
            
            # 다음 핸들러부터만 평가하도록 조건 핸들러 수정
            remaining_handlers = handlers[resume_point.next_handler_index:]
            if remaining_handlers:
                # 임시로 dialog state 수정
                temp_dialog_state = dialog_state.copy()
                temp_dialog_state["conditionHandlers"] = remaining_handlers
                resume_context.current_dialog_state = temp_dialog_state
                
                self.logger.info(f"[RESUME] 남은 핸들러 {len(remaining_handlers)}개 평가 시작")
                
                # 조건 핸들러 실행
                condition_result = await condition_handler.execute(resume_context)
                
                if condition_result.transition_type != TransitionType.NO_TRANSITION:
                    new_state = condition_result.new_state
                    
                    # 핸들러 인덱스 업데이트 (원본 인덱스 기준)
                    actual_handler_index = resume_point.next_handler_index + (condition_result.handler_index or 0)
                    self.stack_manager.update_handler_index(resume_point.session_id, actual_handler_index)
                    self.stack_manager.update_current_state(resume_point.session_id, new_state)
                    
                    # 결과 메시지 병합
                    handler_result.messages.extend(condition_result.messages)
                    
                    # Entry Action 실행
                    await self._execute_entry_action(resume_point.scenario, new_state, handler_result)
                    
                    self.logger.info(f"[RESUME] 조건 매칭 성공: {resume_point.resumed_frame.dialog_state_name} -> {new_state}")
                    return new_state
                else:
                    self.logger.info(f"[RESUME] 매칭되는 조건 없음, 현재 상태 유지: {resume_point.resumed_frame.dialog_state_name}")
                    return resume_point.resumed_frame.dialog_state_name
            else:
                self.logger.info(f"[RESUME] 실행할 핸들러가 없음")
                return resume_point.resumed_frame.dialog_state_name
                
        except Exception as e:
            self.logger.error(f"Error during resume from stack: {e}")
            return resume_point.resumed_frame.dialog_state_name
    
    async def _execute_entry_action(self, scenario: Dict[str, Any], state: str, handler_result: HandlerResult):
        """Entry Action 실행"""
        try:
            entry_response = self.action_executor.execute_entry_action(scenario, state)
            if entry_response:
                handler_result.add_message(entry_response)
                self.logger.info(f"Entry action executed for state: {state}")
        except Exception as e:
            self.logger.error(f"Error executing entry action for {state}: {e}")
            handler_result.add_message(f"⚠️ Entry action 실행 중 오류: {str(e)}")
    
    async def _update_context_for_new_state(self, context: ExecutionContext, new_state: str) -> ExecutionContext:
        """새로운 상태에 대한 컨텍스트 업데이트"""
        
        # 새로운 Dialog State 조회
        new_dialog_state = self.stack_manager.find_dialog_state_for_session(
            context.session_id, context.scenario, new_state
        )
        
        # 전이 직후 인텐트 처리 유예 및 입력 비우기 결정 (동일 요청 내 전이 시에만)
        transitioned_this_request = context.memory.get("_INTENT_TRANSITIONED_THIS_REQUEST", False)
        should_defer_now = transitioned_this_request

        # 동일 요청 내에서는 이전 입력을 새 상태로 넘기지 않음
        new_user_input = None if should_defer_now else context.user_input

        # 즉시 플래그 정리: 요청 내 반복 스킵 방지용
        if transitioned_this_request:
            context.memory.pop("_INTENT_TRANSITIONED_THIS_REQUEST", None)

        # 새로운 컨텍스트 생성
        new_context = ExecutionContext(
            session_id=context.session_id,
            current_state=new_state,
            scenario=context.scenario,
            memory=context.memory,
            user_input=new_user_input,
            current_dialog_state=new_dialog_state,
            has_user_input=context.has_user_input,
            intent_deferred=should_defer_now,  # 새 상태에서는 1회 유예
            intent=context.intent,
            entities=context.entities
        )
        
        return new_context
    
    def get_stack_debug_info(self, session_id: str) -> Dict[str, Any]:
        """디버깅용 스택 정보"""
        return self.stack_manager.get_stack_debug_info(session_id)
