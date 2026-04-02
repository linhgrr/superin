import type { ReactNode } from "react";
import { X } from "lucide-react";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export default function Modal({ title, onClose, children }: ModalProps) {
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
      }}
      onClick={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        style={{
          background: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "0.75rem",
          padding: "1.5rem",
          width: "100%",
          maxWidth: "480px",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "1.25rem",
          }}
        >
          <h2 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600 }}>{title}</h2>
          <button className="btn btn-ghost" onClick={onClose} style={{ padding: "0.25rem" }}>
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
