import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import type { RunnableConfig } from "@langchain/core/runnables";
import { END, MessagesAnnotation, START, StateGraph } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import type { StructuredToolInterface } from "@langchain/core/tools";

import { agentConfig } from "@/lib/agent/config";
import { invokeWithRotation } from "@/lib/agent/provider";

/**
 * The SAAJ agent graph. Deliberately minimal — one reasoning node, one tool
 * node, and a conditional loop between them with a hard step cap:
 *
 *   START → agent → (tool calls? → tools → agent) ... → END
 *
 * The LLM handles intent, tool selection and result interpretation.
 * LangGraph owns the loop, tool execution, the branch, the step limit and
 * (via the caller) state/history. The `agent` node calls the Groq service,
 * which transparently rotates API keys underneath — the graph never sees a
 * key, a cooldown or a retry.
 */
export function buildAgentGraph(tools: StructuredToolInterface[], system: string) {
  const toolNode = new ToolNode(tools);

  async function agent(state: typeof MessagesAnnotation.State, config?: RunnableConfig) {
    const toolTurns = state.messages.filter(
      (m) => m.getType() === "ai" && (m as AIMessage).tool_calls?.length,
    ).length;

    const messages: BaseMessage[] = [
      { role: "system", content: system } as unknown as BaseMessage,
      ...state.messages,
    ];
    // Step cap: after enough tool rounds, force a plain answer (no tools bound).
    const boundTools = toolTurns >= agentConfig.maxSteps ? [] : tools;
    const response = await invokeWithRotation(messages, boundTools, config);
    return { messages: [response] };
  }

  function routeFromAgent(state: typeof MessagesAnnotation.State) {
    const last = state.messages.at(-1) as AIMessage | undefined;
    return last?.tool_calls?.length ? "tools" : END;
  }

  return new StateGraph(MessagesAnnotation)
    .addNode("agent", agent)
    .addNode("tools", toolNode)
    .addEdge(START, "agent")
    .addConditionalEdges("agent", routeFromAgent, ["tools", END])
    .addEdge("tools", "agent")
    .compile();
}
