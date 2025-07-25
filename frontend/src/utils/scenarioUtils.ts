import { FlowNode, FlowEdge, Scenario, DialogState } from '../types/scenario';

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
  edges: FlowEdge[],
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

  // 모든 핸들러의 transitionTarget에서 scenario가 비어 있으면 현재 시나리오 이름으로 채움
  function fillScenarioIfEmpty(handler: any) {
    if (handler && handler.transitionTarget) {
      if (
        (!handler.transitionTarget.scenario || handler.transitionTarget.scenario === "") &&
        handler.transitionTarget.dialogState
      ) {
        // 현재 시나리오 이름 추정 (노드의 시나리오 이름이 필요할 경우 추가 인자로 받아야 함)
        handler.transitionTarget.scenario = scenarioName || (originalScenario?.plan?.[0]?.name) || "MainPlan";
      }
    }
    return handler;
  }

  // 모든 핸들러의 transitionTarget에서 scenario가 id(예: 'scenario-...')이면 name으로 변환
  function normalizeScenarioName(handler: any) {
    if (handler && handler.transitionTarget && typeof handler.transitionTarget.scenario === 'string') {
      const scenarioVal = handler.transitionTarget.scenario;
      if (scenarioVal.startsWith('scenario-') && scenarios && (scenarios as any)[scenarioVal]) {
        // 시나리오 이름 추출 (타입 안전하게)
        const scenarioName = (scenarios as any)[scenarioVal]?.scenario?.plan?.[0]?.name;
        if (scenarioName) handler.transitionTarget.scenario = scenarioName;
      }
    }
    return handler;
  }

  // fillScenarioIfEmpty와 normalizeScenarioName을 모두 적용
  function processHandler(handler: any) {
    return normalizeScenarioName(fillScenarioIfEmpty(handler));
  }

  // 일반 상태 노드만 변환
  const dialogStates: DialogState[] = nodes.filter(node => node.type !== 'scenarioTransition').map(node => {
    // 모든 핸들러에서 scenarioTransition 노드로 전이하는 경우, 실제 타겟 시나리오/상태로 치환
    const ds = { ...node.data.dialogState };
    // conditionHandlers
    if (ds.conditionHandlers) {
      ds.conditionHandlers = ds.conditionHandlers.map(handler => {
        let t = handler.transitionTarget;
        // transitionTarget.scenario가 id면 name으로 변환
        if (t && typeof t.scenario === 'string' && t.scenario.startsWith('scenario-') && scenarios && scenarios[t.scenario]) {
          t.scenario = scenarios[t.scenario].plan[0].name;
        }
        if (t && t.dialogState) {
          const st = scenarios?.[t.dialogState];
          if (st) {
            const scenarioName = st?.plan?.[0]?.name;
            const stateObj = st?.plan?.[0]?.dialogState?.find((ds: any) => ds.name === t?.dialogState);
            if (stateObj && scenarioName) {
              t = { scenario: scenarioName, dialogState: stateObj.name };
            }
          }
        }
        t = fillScenarioIfEmpty(t);
        return { ...handler, transitionTarget: t };
      });
    }
    // intentHandlers
    if (ds.intentHandlers) {
      ds.intentHandlers = ds.intentHandlers.map(handler => {
        let t = handler.transitionTarget;
        if (t && typeof t.scenario === 'string' && t.scenario.startsWith('scenario-') && scenarios && scenarios[t.scenario]) {
          t.scenario = scenarios[t.scenario].plan[0].name;
        }
        if (t && t.dialogState) {
          const st = scenarios?.[t.dialogState];
          if (st) {
            const scenarioName = st?.plan?.[0]?.name;
            const stateObj = st?.plan?.[0]?.dialogState?.find((ds: any) => ds.name === t?.dialogState);
            if (stateObj && scenarioName) {
              t = { scenario: scenarioName, dialogState: stateObj.name };
            }
          }
        }
        t = fillScenarioIfEmpty(t);
        return { ...handler, transitionTarget: t };
      });
    }
    // eventHandlers
    if (ds.eventHandlers) {
      ds.eventHandlers = ds.eventHandlers.map(handler => {
        let t = handler.transitionTarget;
        if (t && typeof t.scenario === 'string' && t.scenario.startsWith('scenario-') && scenarios && scenarios[t.scenario]) {
          t.scenario = scenarios[t.scenario].plan[0].name;
        }
        if (t && t.dialogState) {
          const st = scenarios?.[t.dialogState];
          if (st) {
            const scenarioName = st?.plan?.[0]?.name;
            const stateObj = st?.plan?.[0]?.dialogState?.find((ds: any) => ds.name === t?.dialogState);
            if (stateObj && scenarioName) {
              t = { scenario: scenarioName, dialogState: stateObj.name };
            }
          }
        }
        t = fillScenarioIfEmpty(t);
        return { ...handler, transitionTarget: t };
      });
    }
    // apicallHandlers
    if (ds.apicallHandlers) {
      ds.apicallHandlers = ds.apicallHandlers.map(handler => {
        let t = handler.transitionTarget;
        if (t && typeof t.scenario === 'string' && t.scenario.startsWith('scenario-') && scenarios && scenarios[t.scenario]) {
          t.scenario = scenarios[t.scenario].plan[0].name;
        }
        if (t && t.dialogState) {
          const st = scenarios?.[t.dialogState];
          if (st) {
            const scenarioName = st?.plan?.[0]?.name;
            const stateObj = st?.plan?.[0]?.dialogState?.find((ds: any) => ds.name === t?.dialogState);
            if (stateObj && scenarioName) {
              t = { scenario: scenarioName, dialogState: stateObj.name };
            }
          }
        }
        t = fillScenarioIfEmpty(t);
        return { ...handler, transitionTarget: t };
      });
    }
    return ds;
  });

  // 각 노드의 핸들러에 대해 processHandler를 적용
  nodes.forEach(node => {
    if (node.data && node.data.dialogState) {
      if (Array.isArray(node.data.dialogState.conditionHandlers)) {
        node.data.dialogState.conditionHandlers = node.data.dialogState.conditionHandlers.map(processHandler);
      }
      if (Array.isArray(node.data.dialogState.intentHandlers)) {
        node.data.dialogState.intentHandlers = node.data.dialogState.intentHandlers.map(processHandler);
      }
      if (Array.isArray(node.data.dialogState.eventHandlers)) {
        node.data.dialogState.eventHandlers = node.data.dialogState.eventHandlers.map(processHandler);
      }
      if (Array.isArray(node.data.dialogState.apicallHandlers)) {
        node.data.dialogState.apicallHandlers = node.data.dialogState.apicallHandlers.map(processHandler);
      }
    }
  });

  // 핸들러 내부에서 scenarioTransitionNode 전이 처리 시
  // t.dialogState가 state id라면, 해당 시나리오에서 state name을 찾아 string으로 할당
  nodes.forEach(node => {
    if (node.data && node.data.dialogState) {
      if (Array.isArray(node.data.dialogState.conditionHandlers)) {
        node.data.dialogState.conditionHandlers = node.data.dialogState.conditionHandlers.map(handler => {
          let t = handler.transitionTarget;
          if (t && t.dialogState && scenarios && (scenarios as any)[t.scenario]) {
            const st = (scenarios as any)[t.scenario];
            const scenarioName = st?.scenario?.plan?.[0]?.name;
            const stateObj = st?.scenario?.plan?.[0]?.dialogState?.find((ds: any) => ds.name === t?.dialogState);
            if (stateObj && scenarioName) {
              t = { scenario: scenarioName, dialogState: stateObj.name };
            }
          }
          t = fillScenarioIfEmpty(t);
          return { ...handler, transitionTarget: t };
        });
      }
      if (Array.isArray(node.data.dialogState.intentHandlers)) {
        node.data.dialogState.intentHandlers = node.data.dialogState.intentHandlers.map(handler => {
          let t = handler.transitionTarget;
          if (t && t.dialogState && scenarios && (scenarios as any)[t.scenario]) {
            const st = (scenarios as any)[t.scenario];
            const scenarioName = st?.scenario?.plan?.[0]?.name;
            const stateObj = st?.scenario?.plan?.[0]?.dialogState?.find((ds: any) => ds.name === t?.dialogState);
            if (stateObj && scenarioName) {
              t = { scenario: scenarioName, dialogState: stateObj.name };
            }
          }
          t = fillScenarioIfEmpty(t);
          return { ...handler, transitionTarget: t };
        });
      }
      if (Array.isArray(node.data.dialogState.eventHandlers)) {
        node.data.dialogState.eventHandlers = node.data.dialogState.eventHandlers.map(handler => {
          let t = handler.transitionTarget;
          if (t && t.dialogState && scenarios && (scenarios as any)[t.scenario]) {
            const st = (scenarios as any)[t.scenario];
            const scenarioName = st?.scenario?.plan?.[0]?.name;
            const stateObj = st?.scenario?.plan?.[0]?.dialogState?.find((ds: any) => ds.name === t?.dialogState);
            if (stateObj && scenarioName) {
              t = { scenario: scenarioName, dialogState: stateObj.name };
            }
          }
          t = fillScenarioIfEmpty(t);
          return { ...handler, transitionTarget: t };
        });
      }
      if (Array.isArray(node.data.dialogState.apicallHandlers)) {
        node.data.dialogState.apicallHandlers = node.data.dialogState.apicallHandlers.map(handler => {
          let t = handler.transitionTarget;
          if (t && t.dialogState && scenarios && (scenarios as any)[t.scenario]) {
            const st = (scenarios as any)[t.scenario];
            const scenarioName = st?.scenario?.plan?.[0]?.name;
            const stateObj = st?.scenario?.plan?.[0]?.dialogState?.find((ds: any) => ds.name === t?.dialogState);
            if (stateObj && scenarioName) {
              t = { scenario: scenarioName, dialogState: stateObj.name };
            }
          }
          t = fillScenarioIfEmpty(t);
          return { ...handler, transitionTarget: t };
        });
      }
    }
  });

  // --- scenarioTransitionNodes를 dialogState의 handler로 변환 ---
  // 1. scenarioTransitionNodes 추출
  const scenarioTransitionNodesArr = nodes.filter(node => node.type === 'scenarioTransition');

  // 2. 모든 노드의 id를 key로 매핑
  const nodeMap = Object.fromEntries(nodes.map(n => [n.id, n]));

  // 3. edges에서 source/target 추출
  const allEdges: { source: string; target: string }[] = edges.map(e => ({ source: e.source, target: e.target }));

  // scenarioTransitionNodes를 dialogState의 handler로 변환
  scenarioTransitionNodesArr.forEach(stNode => {
    // source 노드 찾기 (edge의 target이 stNode.id인 edge의 source)
    const sourceEdge = allEdges.find(e => e.target === stNode.id);
    if (!sourceEdge) return;
    const sourceNode = nodeMap[sourceEdge.source];
    if (!sourceNode || !sourceNode.data || !sourceNode.data.dialogState) return;
    // handler 추가 (여기서는 conditionHandler로 추가, 필요시 intentHandler 등으로 확장 가능)
    const handler = {
      conditionStatement: 'True',
      action: {},
      transitionTarget: {
        scenario: stNode.data.targetScenario || '',
        dialogState: stNode.data.targetState || ''
      }
    };
    // 기존 conditionHandlers에 추가
    if (!sourceNode.data.dialogState.conditionHandlers) {
      sourceNode.data.dialogState.conditionHandlers = [];
    }
    sourceNode.data.dialogState.conditionHandlers.push(handler);
  });

  // scenarioTransitionNodes의 targetScenario도 name으로 변환
  let scenarioTransitionNodes = baseScenario.plan[0].scenarioTransitionNodes;
  if (scenarioTransitionNodes) {
    scenarioTransitionNodes = scenarioTransitionNodes.map(node => {
      const targetScenarioId = node.data.targetScenario;
      if (
        targetScenarioId &&
        typeof targetScenarioId === 'string' &&
        targetScenarioId.startsWith('scenario-') &&
        scenarios &&
        scenarios[targetScenarioId]
      ) {
        node = {
          ...node,
          data: {
            ...node.data,
            targetScenario: scenarios[targetScenarioId].plan[0].name
          }
        };
      }
      return node;
    });
  }

  // 최신 시나리오 이름을 적용
  const updatedScenario: Scenario = {
    ...baseScenario,
    plan: [
      {
        ...baseScenario.plan[0],
        name: scenarioName || baseScenario.plan[0].name,
        dialogState: dialogStates,
        ...(scenarioTransitionNodes && { scenarioTransitionNodes })
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

/**
 * 모든 apicallHandlers의 apicall.url 필드를 삭제 (보안/내보내기용)
 */
export function removeApiCallUrlsFromScenario(scenarioOrArray: any) {
  // 여러 시나리오 배열 지원
  const scenarios = Array.isArray(scenarioOrArray) ? scenarioOrArray : [scenarioOrArray];
  scenarios.forEach((scenario) => {
    if (!scenario?.plan) return;
    scenario.plan.forEach((plan: any) => {
      if (!plan?.dialogState) return;
      plan.dialogState.forEach((state: any) => {
        if (Array.isArray(state.apicallHandlers)) {
          state.apicallHandlers.forEach((handler: any) => {
            if (handler.apicall && handler.apicall.url) {
              // eslint-disable-next-line no-console
              console.info(`[REMOVE_URL] state: ${state.name}, handler: ${handler.name} - url 삭제됨 (removed)`);
              delete handler.apicall.url;
            } else {
              // eslint-disable-next-line no-console
              console.info(`[REMOVE_URL] state: ${state.name}, handler: ${handler.name} - url 없음 (no url field)`);
            }
          });
        }
      });
    });
  });
} 