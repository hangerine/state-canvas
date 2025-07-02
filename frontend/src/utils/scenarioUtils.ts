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
  originalScenario?: Scenario | null
): Scenario => {
  // 기본 시나리오 구조 생성
  const baseScenario: Scenario = originalScenario ? { ...originalScenario } : {
    plan: [
      {
        name: "MainPlan",
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

  // 노드들을 DialogState로 변환
  const dialogStates: DialogState[] = nodes.map(node => node.data.dialogState);

  // 첫 번째 플랜의 dialogState 업데이트
  const updatedScenario: Scenario = {
    ...baseScenario,
    plan: [
      {
        ...baseScenario.plan[0],
        dialogState: dialogStates
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
  const currentStates = currentNodes.map(node => node.data.dialogState);

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