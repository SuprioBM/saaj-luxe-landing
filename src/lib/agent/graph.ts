import { AIMessage, type BaseMessage } from "@langchain/core/messages";
import { END, START, StateGraph, MessagesAnnotation } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import type { StructuredToolInterface } from "@langchain/core/tools";

import { agentConfig } from "@/lib/agent/config";
import { makeChatModel } from "@/lib/agent/provider";

/**
 * The SAAJ agent graph. Deliberately minimal — one reasoning node, one tool
 * node, and a conditional loop between them with a hard step cap:
 *
 *   START → agent → (tool calls? → tools → agent) ... → END
 *
 * The LLM handles intent, tool selection and result interpretation.
 * LangGraph owns the loop, tool execution, the branch, the step limit and
 * (via the caller) state/history. No extra nodes just to look complex.
 */
export function buildAgentGraph(tools: StructuredToolInterface[], system: string) {
  const model = makeChatModel().bindTools(tools);
  const toolNode = new ToolNode(tools);

  async function agent(state: typeof MessagesAnnotation.State) {
    const toolTurns = state.messages.filter(
      (m) => m.getType() === "ai" && (m as AIMessage).tool_calls?.length,
    ).length;

    // Step cap: once we've gone around enough times, force a plain answer.
    const messages: BaseMessage[] = [
      { role: "system", content: system } as unknown as BaseMessage,
      ...state.messages,
    ];
    const boundModel = toolTurns >= agentConfig.maxSteps ? makeChatModel() : model;
    const response = await boundModel.invoke(messages);
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
