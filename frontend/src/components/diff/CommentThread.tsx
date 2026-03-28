import { useState } from "react";
import { MessageSquare, Send, X, Loader2 } from "lucide-react";
import { useReplyToComment } from "../../hooks/useReviewApi";
import type { CommentThread as CommentThreadType, CommentNote } from "../../stores/reviewStore";

interface CommentThreadProps {
  thread: CommentThreadType;
  taskId: string;
  onReply?: (threadId: string, body: string) => void;
}

function formatRelativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

function CommentItem({ note }: { note: CommentNote }) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-primary-text">
          {note.author}
        </span>
        <span className="text-[10px] text-muted">
          {formatRelativeTime(note.created_at)}
        </span>
      </div>
      <p className="text-sm text-primary-text/90 whitespace-pre-wrap leading-relaxed">
        {note.body}
      </p>
    </div>
  );
}

export function CommentThread({ thread, taskId, onReply }: CommentThreadProps) {
  const [showReplyInput, setShowReplyInput] = useState(false);
  const [replyText, setReplyText] = useState("");
  const replyMutation = useReplyToComment();

  const parentComment = thread.comments[0];
  const replies = thread.comments.slice(1);

  const handlePostReply = () => {
    if (!replyText.trim()) return;

    if (onReply) {
      onReply(thread.id, replyText);
    } else {
      replyMutation.mutate(
        { taskId, threadId: thread.id, body: replyText },
        {
          onSuccess: () => {
            setReplyText("");
            setShowReplyInput(false);
          },
        },
      );
    }
  };

  if (!parentComment) return null;

  return (
    <div className="border-l-2 border-accent bg-dominant rounded-r px-3 py-2 my-1 space-y-2">
      {/* Parent comment */}
      <CommentItem note={parentComment} />

      {/* Replies */}
      {replies.length > 0 && (
        <div className="ml-3 space-y-2 border-l border-border/50 pl-3">
          {replies.map((reply) => (
            <CommentItem key={reply.id} note={reply} />
          ))}
        </div>
      )}

      {/* Reply action */}
      {!showReplyInput && (
        <button
          onClick={() => setShowReplyInput(true)}
          className="flex items-center gap-1 text-[10px] text-muted hover:text-accent transition-colors"
        >
          <MessageSquare size={10} />
          Reply{replies.length > 0 ? ` (${replies.length})` : ""}
        </button>
      )}

      {/* Reply input area */}
      {showReplyInput && (
        <div className="space-y-1.5">
          <textarea
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            placeholder="Write a reply..."
            className="w-full rounded border border-border bg-secondary px-2 py-1.5 text-sm text-primary-text placeholder:text-muted focus:outline-none focus:border-accent resize-none"
            rows={2}
            autoFocus
          />
          <div className="flex items-center gap-1.5">
            <button
              onClick={handlePostReply}
              disabled={!replyText.trim() || replyMutation.isPending}
              className="flex items-center gap-1 rounded bg-accent px-2 py-0.5 text-[11px] font-medium text-white hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {replyMutation.isPending ? (
                <Loader2 size={10} className="animate-spin" />
              ) : (
                <Send size={10} />
              )}
              Post
            </button>
            <button
              onClick={() => {
                setShowReplyInput(false);
                setReplyText("");
              }}
              className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-muted hover:text-primary-text transition-colors"
            >
              <X size={10} />
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Resolved indicator */}
      {thread.resolved && (
        <span className="text-[10px] text-green-400">Resolved</span>
      )}
    </div>
  );
}
