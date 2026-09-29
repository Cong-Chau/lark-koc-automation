export type RuntimeLogLevel = "info" | "error";

export type RuntimeLogDetails = Record<
  string,
  string | number | boolean | null
>;

export type RuntimeLogEvent = {
  id: string;
  timestamp: string;
  level: RuntimeLogLevel;
  operation: "append-koc" | "prepare-koc";
  phase: string;
  message: string;
  runId?: string;
  trigger?: string;
  status?: "started" | "success" | "skipped" | "error";
  details?: RuntimeLogDetails;
};

type RuntimeLogInput = Omit<RuntimeLogEvent, "id" | "timestamp" | "level"> & {
  details?: RuntimeLogDetails;
};

type RuntimeLogGlobal = typeof globalThis & {
  __larkKocRuntimeLogs?: RuntimeLogEvent[];
  __larkKocRuntimeLogSequence?: number;
};

const MAX_RUNTIME_LOG_EVENTS = 200;
const runtimeLogGlobal = globalThis as RuntimeLogGlobal;

function getEvents(): RuntimeLogEvent[] {
  runtimeLogGlobal.__larkKocRuntimeLogs ??= [];
  return runtimeLogGlobal.__larkKocRuntimeLogs;
}

function nextLogId(): string {
  runtimeLogGlobal.__larkKocRuntimeLogSequence =
    (runtimeLogGlobal.__larkKocRuntimeLogSequence ?? 0) + 1;

  return `${Date.now()}-${runtimeLogGlobal.__larkKocRuntimeLogSequence}`;
}

function toConsolePayload(event: RuntimeLogEvent): RuntimeLogDetails {
  return {
    timestamp: event.timestamp,
    level: event.level,
    operation: event.operation,
    phase: event.phase,
    message: event.message,
    ...(event.runId ? { runId: event.runId } : {}),
    ...(event.trigger ? { trigger: event.trigger } : {}),
    ...(event.status ? { status: event.status } : {}),
    ...(event.details ?? {}),
  };
}

function appendRuntimeLog(
  level: RuntimeLogLevel,
  input: RuntimeLogInput,
): RuntimeLogEvent {
  const event: RuntimeLogEvent = {
    id: nextLogId(),
    timestamp: new Date().toISOString(),
    level,
    ...input,
  };
  const events = getEvents();

  events.push(event);

  if (events.length > MAX_RUNTIME_LOG_EVENTS) {
    events.splice(0, events.length - MAX_RUNTIME_LOG_EVENTS);
  }

  const payload = JSON.stringify(toConsolePayload(event));

  if (level === "error") {
    console.error(payload);
  } else {
    console.info(payload);
  }

  return event;
}

export function logRuntimeInfo(input: RuntimeLogInput): RuntimeLogEvent {
  return appendRuntimeLog("info", input);
}

export function logRuntimeError(input: RuntimeLogInput): RuntimeLogEvent {
  return appendRuntimeLog("error", input);
}

export function getRuntimeLogSnapshot(limit = 100): {
  events: RuntimeLogEvent[];
  maxEvents: number;
  retainedEvents: number;
} {
  const events = getEvents();
  const normalizedLimit = Math.max(1, Math.min(limit, MAX_RUNTIME_LOG_EVENTS));

  return {
    events: events.slice(-normalizedLimit).reverse(),
    maxEvents: MAX_RUNTIME_LOG_EVENTS,
    retainedEvents: events.length,
  };
}
