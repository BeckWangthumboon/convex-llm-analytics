import { useEffect, useRef, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { ArrowUp, RotateCcw, LoaderCircle } from "lucide-react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const THREAD_STORAGE_KEY = "chat-thread-id";

type ThreadId = Id<"threads">;

export function ChatScreen() {
  const createThread = useMutation(api.chat.createThread);
  const sendMessage = useAction(api.chatActions.sendMessage);

  const [threadId, setThreadId] = useState<ThreadId | null>(null);
  const [prompt, setPrompt] = useState("");
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const storedThreadId = window.localStorage.getItem(
      THREAD_STORAGE_KEY
    ) as ThreadId | null;

    if (storedThreadId) {
      setThreadId(storedThreadId);
      setIsBootstrapping(false);
      return;
    }

    void (async () => {
      try {
        const { threadId: newThreadId } = await createThread();
        window.localStorage.setItem(THREAD_STORAGE_KEY, newThreadId);
        setThreadId(newThreadId);
      } catch (error) {
        setErrorMessage(
          error instanceof Error ? error.message : "Failed to create thread."
        );
      } finally {
        setIsBootstrapping(false);
      }
    })();
  }, [createThread]);

  const messages = useQuery(
    api.chat.listMessages,
    threadId ? { threadId } : "skip"
  );

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isSending]);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 200) + "px";
    }
  }, [prompt]);

  async function handleSend() {
    if (!threadId || !prompt.trim() || isSending) return;

    setIsSending(true);
    setErrorMessage(null);

    try {
      await sendMessage({ threadId, prompt });
      setPrompt("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Message failed."
      );
    } finally {
      setIsSending(false);
      textareaRef.current?.focus();
    }
  }

  async function handleClear() {
    setErrorMessage(null);
    setIsBootstrapping(true);

    try {
      const { threadId: newThreadId } = await createThread();
      window.localStorage.setItem(THREAD_STORAGE_KEY, newThreadId);
      setThreadId(newThreadId);
      setPrompt("");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to clear chat."
      );
    } finally {
      setIsBootstrapping(false);
    }
  }

  const hasMessages = messages && messages.length > 0;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between px-5 py-3">
        <span className="text-base font-semibold text-foreground">Chat</span>
        <button
          className="flex size-8 items-center justify-center rounded-lg border-none bg-transparent text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:cursor-default disabled:opacity-30"
          onClick={() => void handleClear()}
          disabled={isBootstrapping || isSending}
          title="New chat"
        >
          <RotateCcw size={16} />
        </button>
      </header>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 [scrollbar-color:var(--accent)_transparent] [scrollbar-width:thin]">
        <div className="mx-auto flex max-w-[680px] flex-col gap-5 py-4 pb-6">
          {isBootstrapping ? (
            <div className="flex min-h-[300px] items-center justify-center text-muted-foreground">
              <LoaderCircle className="animate-spin" size={24} />
            </div>
          ) : !hasMessages ? (
            <div className="flex min-h-[300px] items-center justify-center">
              <p className="text-xl text-muted-foreground">
                How can I help you today?
              </p>
            </div>
          ) : (
            messages.map((message) => {
              const isUser = message.role === "user";
              return (
                <div
                  key={message._id}
                  className={`flex ${isUser ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] whitespace-pre-wrap break-words text-[15px] leading-relaxed ${
                      isUser
                        ? "rounded-3xl bg-accent px-4 py-2.5 text-foreground"
                        : "px-0 py-0.5 text-foreground/85"
                    }`}
                  >
                    {message.content}
                  </div>
                </div>
              );
            })
          )}

          {isSending && (
            <div className="flex justify-start">
              <div className="px-0 py-2 text-foreground/85">
                <div className="flex items-center gap-1">
                  <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:0ms]" />
                  <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:200ms]" />
                  <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:400ms]" />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="shrink-0 px-4 pb-6 pt-2">
        <div className="mx-auto max-w-[680px]">
          {errorMessage && (
            <div className="mb-2 rounded-xl bg-destructive/15 px-3.5 py-2 text-[13px] text-destructive">
              {errorMessage}
            </div>
          )}
          <div className="flex items-end gap-2 rounded-3xl border border-transparent bg-accent px-4 py-2 transition-colors focus-within:border-border">
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSend();
                }
              }}
              placeholder="Message..."
              rows={1}
              disabled={isBootstrapping || isSending || !threadId}
              className="flex-1 resize-none border-none bg-transparent py-1.5 font-[inherit] text-[15px] leading-normal text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-40"
            />
            <button
              className="flex size-8 shrink-0 items-center justify-center rounded-full border-none bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-default disabled:bg-muted disabled:text-muted-foreground"
              onClick={() => void handleSend()}
              disabled={
                !prompt.trim() || isBootstrapping || isSending || !threadId
              }
            >
              <ArrowUp size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
