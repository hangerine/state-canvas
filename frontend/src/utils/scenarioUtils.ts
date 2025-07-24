import { FlowNode, Scenario, DialogState } from '../types/scenario';

export interface ScenarioChanges {
  added: DialogState[];
  modified: DialogState[];
  removed: DialogState[];
}

/**
 * FlowNode 배열을 Scenario JSON 형식으로 변환
 */
export const convertNodesToScenario = (
  nodes: FlowNode[],
  originalScenario?: Scenario | null,
  scenarioName?: string,
  scenarios?: Record<string, Scenario> // 시나리오 ID→객체 맵 추가
): Scenario => {
  // 기본 시나리오 구조 생성
  const baseScenario: Scenario = originalScenario ? { ...originalScenario } : {
    plan: [
      {
        name: scenarioName || "MainPlan",
        dialogState: []
      }
    ],
    botConfig: {
      botType: "CONVERSATIONAL"
    },
    intentMapping: [],
    multiIntentMapping: [],
    handlerGroups: [],
    webhooks: [],
    dialogResult: "END_SESSION"
  };

  // scenarioTransition 노드 id 집합
  const scenarioTransitionNodeIds = new Set(
    nodes.filter(n => n.type === 'scenarioTransition').map(n => n.id)
  );

  // scenarioTransition 노드의 id → 시나리오 이름 맵 생성
  const scenarioIdToName: Record<string, string> = {};
  if (scenarios) {
    Object.entries(scenarios).forEach(([id, scenario]) => {
      if (scenario.plan && scenario.plan[0]?.name) {
        scenarioIdToName[id] = scenario.plan[0].name;
      }
    });
  }

  // scenarioTransition 노드의 전이 정보 맵 (id → {scenario, dialogState})
  const scenarioTransitionMap: Record<string, { scenario: string; dialogState: string }> = {};
  nodes.forEach(node => {
    if (node.type === 'scenarioTransition') {
      if (node.data.targetScenario && node.data.targetState) {
        scenarioTransitionMap[node.id] = {
          scenario: node.data.targetScenario,
          dialogState: node.data.targetState
        };
      }
    }
  });

  // 일반 상태 노드만 변환
  const dialogStates: DialogState[] = nodes.filter(node => node.type !== 'scenarioTransition').map(node => {
    // 모든 핸들러에서 scenarioTransition 노드로 전이하는 경우, 실제 타겟 시나리오/상태로 치환
    const ds = { ...node.data.dialogState };
    // conditionHandlers
    if (ds.conditionHandlers) {
      ds.conditionHandlers = ds.conditionHandlers.map(handler => {
        if (handler.transitionTarget && scenarioTransitionNodeIds.has(handler.transitionTarget.dialogState)) {
          const st = scenarioTransitionMap[handler.transitionTarget.dialogState];
          if (st) {
            return {
              ...handler,
              transitionTarget: {
                scenario: st.scenario,
                dialogState: st.dialogState
              }
            };
          }
        }
        return handler;
      });
    }
    // intentHandlers
    if (ds.intentHandlers) {
      ds.intentHandlers = ds.intentHandlers.map(handler => {
        if (handler.transitionTarget && scenarioTransitionNodeIds.has(handler.transitionTarget.dialogState)) {
          const st = scenarioTransitionMap[handler.transitionTarget.dialogState];
          if (st) {
            return {
              ...handler,
              transitionTarget: {
                scenario: st.scenario,
                dialogState: st.dialogState
              }
            };
          }
        }
        return handler;
      });
    }
    // eventHandlers
    if (ds.eventHandlers) {
      ds.eventHandlers = ds.eventHandlers.map(handler => {
        if (handler.transitionTarget && scenarioTransitionNodeIds.has(handler.transitionTarget.dialogState)) {
          const st = scenarioTransitionMap[handler.transitionTarget.dialogState];
          if (st) {
            return {
              ...handler,
              transitionTarget: {
                scenario: st.scenario,
                dialogState: st.dialogState
              }
            };
          }
        }
        return handler;
      });
    }
    // apicallHandlers
    if (ds.apicallHandlers) {
      ds.apicallHandlers = ds.apicallHandlers.map(handler => {
        if (handler.transitionTarget && scenarioTransitionNodeIds.has(handler.transitionTarget.dialogState)) {
          const st = scenarioTransitionMap[handler.transitionTarget.dialogState];
          if (st) {
            return {
              ...handler,
              transitionTarget: {
                scenario: st.scenario,
                dialogState: st.dialogState
              }
            };
          }
        }
        return handler;
      });
    }
    return ds;
  });

  // scenarioTransition 노드도 별도 저장
  const scenarioTransitionNodes = nodes.filter(n => n.type === 'scenarioTransition').map(n => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: {
      label: n.data.label,
      dialogState: n.data.dialogState || {}, // FlowNode 타입에 맞게 추가
      targetScenario: n.data.targetScenario,
      targetState: n.data.targetState
    },
    style: n.style
  }));

  // 최신 시나리오 이름을 적용
  const scenarioNameToUse = scenarioName || (originalScenario?.plan?.[0]?.name) || "MainPlan";

  // 첫 번째 플랜의 dialogState와 name 업데이트
  const updatedScenario: Scenario = {
    ...baseScenario,
    plan: [
      {
        ...baseScenario.plan[0],
        name: scenarioNameToUse,
        dialogState: dialogStates,
        // scenarioTransition 노드도 dialogState에 별도 필드로 저장
        scenarioTransitionNodes // 추가
      }
    ]
  };

  return updatedScenario;
};

/**
 * 두 DialogState가 동일한지 비교 (깊은 비교)
 */
const areDialogStatesEqual = (state1: DialogState, state2: DialogState): boolean => {
  try {
    return JSON.stringify(state1) === JSON.stringify(state2);
  } catch {
    return false;
  }
};

/**
 * 원본 시나리오와 현재 노드들을 비교하여 변경사항 분석
 */
export const compareScenarios = (
  currentNodes: FlowNode[],
  originalScenario: Scenario | null
): ScenarioChanges => {
  const changes: ScenarioChanges = {
    added: [],
    modified: [],
    removed: []
  };

  if (!originalScenario || !originalScenario.plan[0]?.dialogState) {
    // 원본이 없으면 모든 현재 노드를 추가된 것으로 간주
    changes.added = currentNodes.map(node => node.data.dialogState);
    return changes;
  }

  const originalStates = originalScenario.plan[0].dialogState;
  const currentStates = currentNodes
    .filter(node => node.type !== 'scenarioTransition')
    .map(node => node.data.dialogState);

  // 원본에서 이름으로 매핑 생성
  const originalStateMap = new Map<string, DialogState>();
  originalStates.forEach(state => {
    originalStateMap.set(state.name, state);
  });

  // 현재 상태에서 이름으로 매핑 생성
  const currentStateMap = new Map<string, DialogState>();
  currentStates.forEach(state => {
    currentStateMap.set(state.name, state);
  });

  // 추가된 상태와 수정된 상태 찾기
  currentStates.forEach(currentState => {
    const originalState = originalStateMap.get(currentState.name);
    
    if (!originalState) {
      // 새로 추가된 상태
      changes.added.push(currentState);
    } else if (!areDialogStatesEqual(originalState, currentState)) {
      // 수정된 상태
      changes.modified.push(currentState);
    }
  });

  // 삭제된 상태 찾기
  originalStates.forEach(originalState => {
    if (!currentStateMap.has(originalState.name)) {
      changes.removed.push(originalState);
    }
  });

  // scenarioTransitionNodes 비교 추가
  const originalTransitionNodes: FlowNode[] = (originalScenario?.plan[0] as any)?.scenarioTransitionNodes || [];
  const currentTransitionNodes: FlowNode[] = currentNodes.filter(n => n.type === 'scenarioTransition');

  // id로 매핑
  const originalTransitionMap = new Map<string, FlowNode>();
  originalTransitionNodes.forEach(n => originalTransitionMap.set(n.id, n));
  const currentTransitionMap = new Map<string, FlowNode>();
  currentTransitionNodes.forEach(n => currentTransitionMap.set(n.id, n));

  // 추가/수정된 전이노드
  currentTransitionNodes.forEach(n => {
    const orig = originalTransitionMap.get(n.id);
    if (!orig) {
      changes.added.push(n.data.dialogState); // 새로 추가된 전이노드
    } else {
      // label, targetScenario, targetState, position 등 비교
      if (
        n.data.label !== orig.data.label ||
        n.data.targetScenario !== orig.data.targetScenario ||
        n.data.targetState !== orig.data.targetState ||
        JSON.stringify(n.position) !== JSON.stringify(orig.position)
      ) {
        changes.modified.push(n.data.dialogState); // 수정된 전이노드
      }
    }
  });
  // 삭제된 전이노드
  originalTransitionNodes.forEach(n => {
    if (!currentTransitionMap.has(n.id)) {
      changes.removed.push(n.data.dialogState);
    }
  });

  return changes;
};

/**
 * 시나리오를 JSON 파일로 다운로드
 */
export const downloadScenarioAsJSON = (scenario: Scenario, filename: string) => {
  const dataStr = JSON.stringify(scenario, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.json') ? filename : `${filename}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

/**
 * 시나리오 유효성 검증
 */
export const validateScenario = (scenario: any): boolean => {
  if (!scenario || typeof scenario !== 'object') return false;
  if (!scenario.plan || !Array.isArray(scenario.plan)) return false;
  if (scenario.plan.length === 0) return false;
  
  const firstPlan = scenario.plan[0];
  if (!firstPlan.dialogState || !Array.isArray(firstPlan.dialogState)) return false;
  
  return true;
};

/**
 * 변경사항이 있는지 확인
 */
export const hasScenarioChanges = (changes: ScenarioChanges): boolean => {
  return changes.added.length > 0 || 
         changes.modified.length > 0 || 
         changes.removed.length > 0;
};

/**
 * 변경사항 요약 텍스트 생성
 */
export const getChangesSummary = (changes: ScenarioChanges): string => {
  const parts: string[] = [];
  
  if (changes.added.length > 0) {
    parts.push(`${changes.added.length}개 추가`);
  }
  
  if (changes.modified.length > 0) {
    parts.push(`${changes.modified.length}개 수정`);
  }
  
  if (changes.removed.length > 0) {
    parts.push(`${changes.removed.length}개 삭제`);
  }
  
  return parts.length > 0 ? parts.join(', ') : '변경사항 없음';
}; 