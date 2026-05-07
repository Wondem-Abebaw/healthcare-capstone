"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { getSession, getMessages, streamChat, uploadDocument } from "@/lib/api";
import { AgentTimeline } from "./AgentTimeline";
import { MessageBubble } from "./MessageBubble";
import type { Message, SSEEvent, DiagnosisEntry, AgentLogEntry } from "@/types";
import {
  ArrowLeft,
  Send,
  Paperclip,
  Activity,
  FileText,
  AlertTriangle,
  Loader2,
  ChevronRight,
} from "lucide-react";

interface LiveState {
  running: boolean;
  logs: AgentLogEntry[];
  activeAgent: string | null;
  differential: DiagnosisEntry[];
  redFlags: string[];
  done: boolean;
}

const SUGGESTED = [
  "35yo male, chest pain 2 days, radiating to left arm, shortness of breath",
  "Persistent headache, fever 38.5°C, neck stiffness, photophobia",
  "50yo female, fatigue 3 months, weight gain, cold intolerance, hair loss",
];

export function SessionClient({ sessionId }: { sessionId: string }) {
  const router = useRouter();
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<(() => void) | null>(null);
  const [input, setInput] = useState("");
  const [localMsgs, setLocalMsgs] = useState<Message[]>([]);
  const [live, setLive] = useState<LiveState>({
    running: false,
    logs: [],
    activeAgent: null,
    differential: [],
    redFlags: [],
    done: false,
  });
  const [panel, setPanel] = useState<"timeline" | "report">("timeline");
  const [uploading, setUploading] = useState(false);

  const { data: session } = useQuery({
    queryKey: ["session", sessionId],
    queryFn: () => getSession(sessionId),
  });
  const { data: serverMsgs = [] } = useQuery({
    queryKey: ["messages", sessionId],
    queryFn: () => getMessages(sessionId),
    refetchInterval: live.running ? false : live.done ? false : 5000,
  });

  const allMsgs = [
    ...serverMsgs,
    ...localMsgs.filter((lm) => !serverMsgs.find((sm) => sm.id === lm.id)),
  ].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [allMsgs, live.logs]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || live.running) return;
    setInput("");
    setLocalMsgs((m) => [
      ...m,
      {
        id: `tmp-${Date.now()}`,
        session_id: sessionId,
        role: "user",
        content: text,
        agent_name: null,
        created_at: new Date().toISOString(),
      },
    ]);
    setLive({
      running: true,
      logs: [],
      activeAgent: null,
      differential: [],
      redFlags: [],
      done: false,
    });

    cancelRef.current = streamChat(
      sessionId,
      text,
      (event) => {
        const e = event as SSEEvent;
        if (e.type === "agent_start")
          setLive((s) => ({ ...s, activeAgent: e.agent }));
        else if (e.type === "agent_log")
          setLive((s) => ({
            ...s,
            logs: [
              ...s.logs,
              {
                agent: e.agent,
                action: e.action,
                content: e.content,
                timestamp: new Date().toISOString(),
              },
            ],
          }));
        else if (e.type === "complete") {
          setLive((s) => ({
            ...s,
            differential: e.differential_dx,
            redFlags: e.red_flags,
            activeAgent: null,
          }));
          setPanel("report");
          setLocalMsgs((m) => [
            ...m,
            {
              id: `asst-${Date.now()}`,
              session_id: sessionId,
              role: "assistant",
              content: e.report_summary,
              agent_name: "Report Agent",
              created_at: new Date().toISOString(),
            },
          ]);
        }
      },
      () => setLive((s) => ({ ...s, running: false, done: true })),
      (err) => {
        setLive((s) => ({ ...s, running: false }));
        console.error("SSE error:", err);
      },
    );
  }, [input, sessionId, live.running]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadDocument(file, sessionId);
      setLocalMsgs((m) => [
        ...m,
        {
          id: `doc-${Date.now()}`,
          session_id: sessionId,
          role: "assistant",
          content: `📄 Document "${file.name}" uploaded and indexed into Qdrant.`,
          agent_name: "System",
          created_at: new Date().toISOString(),
        },
      ]);
    } catch (err) {
      console.error(err);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const V = {
    // shorthand CSS vars
    void: "var(--color-void)",
    surface: "var(--color-surface)",
    panel: "var(--color-panel)",
    border: "var(--color-border)",
    muted: "var(--color-muted)",
    ink: "var(--color-ink)",
    subtext: "var(--color-subtext)",
    ghost: "var(--color-ghost)",
    cyan: "var(--color-cyan-bright)",
    cyanMid: "var(--color-cyan-mid)",
    cyanDim: "var(--color-cyan-dim)",
    vital: "var(--color-vital)",
    warn: "var(--color-warn)",
    alert: "var(--color-alert)",
    mono: "var(--font-mono)",
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        background: V.void,
      }}
    >
      {/* Header */}
      <header
        style={{
          flexShrink: 0,
          borderBottom: `1px solid ${V.border}`,
          background: `color-mix(in srgb, ${V.surface} 90%, transparent)`,
          backdropFilter: "blur(8px)",
          padding: "0.75rem 1rem",
          display: "flex",
          alignItems: "center",
          gap: "1rem",
        }}
      >
        <button
          className="btn-ghost"
          style={{ padding: "0.375rem 0.5rem" }}
          onClick={() => router.push("/")}
        >
          <ArrowLeft size={16} />
        </button>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            flex: 1,
            minWidth: 0,
          }}
        >
          <div
            style={{
              width: "0.5rem",
              height: "0.5rem",
              borderRadius: "50%",
              background: live.running
                ? V.cyan
                : live.done
                  ? V.vital
                  : V.border,
              flexShrink: 0,
              animation: live.running ? "pulse 1.5s infinite" : "none",
            }}
          />
          <div style={{ minWidth: 0 }}>
            <span
              style={{
                color: V.ink,
                fontWeight: 500,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                display: "block",
              }}
            >
              {session?.patient_name ?? "Anonymous Patient"}
            </span>
            {session?.chief_complaint && (
              <span
                style={{
                  color: V.ghost,
                  fontSize: "0.75rem",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  display: "block",
                }}
              >
                {session.chief_complaint}
              </span>
            )}
          </div>
        </div>
        {live.done && (
          <button
            className="btn-ghost"
            style={{ fontSize: "0.75rem", gap: "0.375rem", flexShrink: 0 }}
            onClick={() => router.push(`/reports/${sessionId}`)}
          >
            <FileText size={14} /> View Report <ChevronRight size={12} />
          </button>
        )}
        {/* Panel toggle */}
        <div
          style={{
            display: "flex",
            border: `1px solid ${V.border}`,
            borderRadius: "0.5rem",
            overflow: "hidden",
            flexShrink: 0,
          }}
        >
          {(["timeline", "report"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPanel(p)}
              style={{
                padding: "0.375rem 0.75rem",
                fontSize: "0.75rem",
                fontFamily: V.mono,
                textTransform: "capitalize",
                background: panel === p ? V.muted : "transparent",
                color: panel === p ? V.ink : V.ghost,
                border: "none",
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </header>

      {/* Body */}
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Chat */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            minWidth: 0,
          }}
        >
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "1.5rem 1rem",
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
          >
            {allMsgs.length === 0 && !live.running && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{ textAlign: "center", padding: "4rem 1rem" }}
              >
                <Activity
                  size={40}
                  color={V.ghost}
                  style={{ margin: "0 auto 1rem" }}
                />
                <p style={{ color: V.subtext }}>
                  Describe the patient&apos;s symptoms to begin.
                </p>
                <p
                  style={{
                    color: V.ghost,
                    fontSize: "0.875rem",
                    marginTop: "0.5rem",
                  }}
                >
                  The AI will run all 4 agents automatically.
                </p>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "0.5rem",
                    justifyContent: "center",
                    marginTop: "1.5rem",
                  }}
                >
                  {SUGGESTED.map((p) => (
                    <button
                      key={p}
                      onClick={() => setInput(p)}
                      style={{
                        fontSize: "0.75rem",
                        color: V.subtext,
                        border: `1px solid ${V.border}`,
                        background: "transparent",
                        padding: "0.375rem 0.75rem",
                        borderRadius: "9999px",
                        cursor: "pointer",
                        maxWidth: "20rem",
                        textAlign: "left",
                        transition: "all 0.2s",
                        lineHeight: 1.4,
                      }}
                      onMouseEnter={(e) => {
                        (
                          e.currentTarget as HTMLButtonElement
                        ).style.borderColor = V.cyanDim;
                        (e.currentTarget as HTMLButtonElement).style.color =
                          V.ink;
                      }}
                      onMouseLeave={(e) => {
                        (
                          e.currentTarget as HTMLButtonElement
                        ).style.borderColor = V.border;
                        (e.currentTarget as HTMLButtonElement).style.color =
                          V.subtext;
                      }}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
            <AnimatePresence initial={false}>
              {allMsgs.map((msg) => (
                <MessageBubble key={msg.id} message={msg} />
              ))}
            </AnimatePresence>
            {live.running && live.activeAgent && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  color: V.cyan,
                  fontSize: "0.75rem",
                }}
              >
                <Loader2
                  size={14}
                  style={{ animation: "spin 1s linear infinite" }}
                />
                <span style={{ fontFamily: V.mono }}>
                  {live.activeAgent} agent is working...
                </span>
              </motion.div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Red flags */}
          <AnimatePresence>
            {live.redFlags.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                style={{
                  margin: "0 1rem 0.5rem",
                  padding: "0.75rem",
                  borderRadius: "0.75rem",
                  border: `1px solid color-mix(in srgb, ${V.alert} 30%, transparent)`,
                  background: `color-mix(in srgb, ${V.alert} 5%, transparent)`,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.5rem",
                }}
              >
                <AlertTriangle
                  size={16}
                  color={V.alert}
                  style={{ flexShrink: 0, marginTop: "0.125rem" }}
                />
                <div>
                  <span
                    style={{
                      color: V.alert,
                      fontSize: "0.75rem",
                      fontFamily: V.mono,
                      fontWeight: 600,
                    }}
                  >
                    RED FLAGS:{" "}
                  </span>
                  <span
                    style={{
                      color: `color-mix(in srgb, ${V.alert} 80%, transparent)`,
                      fontSize: "0.75rem",
                    }}
                  >
                    {live.redFlags.join(" · ")}
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Input */}
          <div
            style={{
              flexShrink: 0,
              borderTop: `1px solid ${V.border}`,
              background: `color-mix(in srgb, ${V.surface} 80%, transparent)`,
              backdropFilter: "blur(8px)",
              padding: "1rem",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: "0.75rem",
                alignItems: "flex-end",
              }}
            >
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.txt"
                style={{ display: "none" }}
                onChange={handleFile}
              />
              <button
                className="btn-ghost"
                style={{ padding: "0.625rem", flexShrink: 0 }}
                title="Upload PDF for RAG"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2
                    size={16}
                    style={{ animation: "spin 1s linear infinite" }}
                  />
                ) : (
                  <Paperclip size={16} />
                )}
              </button>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                disabled={live.running}
                placeholder="Describe symptoms, ask follow-up questions..."
                rows={1}
                style={{
                  resize: "none",
                  minHeight: "44px",
                  maxHeight: "128px",
                  flex: 1,
                  paddingTop: "0.625rem",
                  paddingBottom: "0.625rem",
                }}
                className="input-base"
                onInput={(e) => {
                  const t = e.currentTarget;
                  t.style.height = "auto";
                  t.style.height = `${Math.min(t.scrollHeight, 128)}px`;
                }}
              />
              <button
                className="btn-primary"
                style={{ padding: "0.625rem 0.75rem", flexShrink: 0 }}
                onClick={handleSend}
                disabled={!input.trim() || live.running}
              >
                {live.running ? (
                  <Loader2
                    size={16}
                    style={{ animation: "spin 1s linear infinite" }}
                  />
                ) : (
                  <Send size={16} />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Right panel — hidden on mobile */}
        <aside
          style={{
            width: "22rem",
            flexShrink: 0,
            borderLeft: `1px solid ${V.border}`,
            background: `color-mix(in srgb, ${V.surface} 50%, transparent)`,
            overflowY: "auto",
            display: "none",
          }}
          className="lg-panel"
        >
          <AnimatePresence mode="wait">
            {panel === "timeline" ? (
              <AgentTimeline
                key="timeline"
                logs={live.logs}
                activeAgent={live.activeAgent}
              />
            ) : (
              <DiagnosisPanel
                key="report"
                differential={live.differential}
                redFlags={live.redFlags}
                sessionId={sessionId}
                done={live.done}
              />
            )}
          </AnimatePresence>
        </aside>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        @media (min-width: 1024px) { .lg-panel { display: block !important } }
      `}</style>
    </div>
  );
}

function DiagnosisPanel({
  differential,
  redFlags,
  sessionId,
  done,
}: {
  differential: DiagnosisEntry[];
  redFlags: string[];
  sessionId: string;
  done: boolean;
}) {
  const router = useRouter();
  const V = {
    border: "var(--color-border)",
    ghost: "var(--color-ghost)",
    subtext: "var(--color-subtext)",
    ink: "var(--color-ink)",
    alert: "var(--color-alert)",
    warn: "var(--color-warn)",
    vital: "var(--color-vital)",
    muted: "var(--color-muted)",
    mono: "var(--font-mono)",
    cyan: "var(--color-cyan-bright)",
    cyanDim: "var(--color-cyan-dim)",
  };

  if (!differential.length)
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{ padding: "1.5rem", textAlign: "center" }}
      >
        <FileText
          size={32}
          color={V.ghost}
          style={{ margin: "0 auto 0.75rem" }}
        />
        <p style={{ color: V.subtext, fontSize: "0.875rem" }}>
          Diagnosis results will appear here after the pipeline runs.
        </p>
      </motion.div>
    );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        padding: "1rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "0.5rem",
        }}
      >
        <span
          style={{
            fontFamily: V.mono,
            fontSize: "0.65rem",
            color: V.subtext,
            textTransform: "uppercase",
            letterSpacing: "0.15em",
          }}
        >
          Differential Dx
        </span>
        {done && (
          <button
            onClick={() => router.push(`/reports/${sessionId}`)}
            style={{
              fontSize: "0.7rem",
              color: V.cyan,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.25rem",
              fontFamily: V.mono,
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.color = "var(--color-cyan-glow)")
            }
            onMouseLeave={(e) => (e.currentTarget.style.color = V.cyan)}
          >
            Full Report <ChevronRight size={11} />
          </button>
        )}
      </div>

      {redFlags.length > 0 && (
        <div
          style={{
            padding: "0.75rem",
            borderRadius: "0.5rem",
            border: `1px solid color-mix(in srgb, ${V.alert} 30%, transparent)`,
            background: `color-mix(in srgb, ${V.alert} 5%, transparent)`,
          }}
        >
          <p
            style={{
              color: V.alert,
              fontSize: "0.7rem",
              fontFamily: V.mono,
              marginBottom: "0.25rem",
            }}
          >
            ⚠ Red Flags
          </p>
          {redFlags.map((f, i) => (
            <div
              key={i}
              style={{
                color: `color-mix(in srgb, ${V.alert} 80%, transparent)`,
                fontSize: "0.75rem",
              }}
            >
              {f}
            </div>
          ))}
        </div>
      )}

      {differential.map((dx, i) => {
        const probColor =
          dx.probability === "High"
            ? V.alert
            : dx.probability === "Moderate"
              ? V.warn
              : V.vital;
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.08 }}
            className="panel-glass"
            style={{ padding: "0.75rem" }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "0.5rem",
                marginBottom: "0.375rem",
              }}
            >
              <span
                style={{
                  color: V.ink,
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  lineHeight: 1.3,
                }}
              >
                {dx.condition}
              </span>
              <span
                className={`tag-${dx.probability.toLowerCase()}`}
                style={{ flexShrink: 0 }}
              >
                {dx.probability}
              </span>
            </div>
            <p
              style={{
                color: V.ghost,
                fontFamily: V.mono,
                fontSize: "0.65rem",
                marginBottom: "0.5rem",
              }}
            >
              {dx.icd10_code}
            </p>
            <p
              style={{
                color: V.subtext,
                fontSize: "0.75rem",
                lineHeight: 1.5,
                display: "-webkit-box",
                WebkitLineClamp: 3,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {dx.reasoning}
            </p>
            {dx.recommended_workup?.length > 0 && (
              <div
                style={{
                  marginTop: "0.5rem",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.25rem",
                }}
              >
                {dx.recommended_workup.slice(0, 4).map((w, j) => (
                  <span
                    key={j}
                    style={{
                      color: V.ghost,
                      fontSize: "0.65rem",
                      background: V.muted,
                      padding: "0.125rem 0.375rem",
                      borderRadius: "0.25rem",
                      fontFamily: V.mono,
                    }}
                  >
                    {w}
                  </span>
                ))}
              </div>
            )}
          </motion.div>
        );
      })}
    </motion.div>
  );
}
