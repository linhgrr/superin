import { useState } from "react";
import type { FormEvent } from "react";
import { DynamicIcon } from "@/lib/icon-resolver";
import type { CategoryRead } from "../api";
import { updateCategory, deleteCategory } from "../api";

interface CategoryEditFormProps {
  category: CategoryRead;
  onSave: (category: CategoryRead) => void;
  onCancel: () => void;
  onDelete?: (id: string) => void;
}

export default function CategoryEditForm({ category, onSave, onCancel, onDelete }: CategoryEditFormProps) {
  const [name, setName] = useState(category.name);
  const [icon, setIcon] = useState(category.icon);
  const [color, setColor] = useState(category.color);
  const [budget, setBudget] = useState(String(category.budget || ""));
  const [loading, setLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const updated = await updateCategory(category.id, {
        name: name.trim(),
        icon: icon.trim() || "Tag",
        color: color.trim() || "var(--color-primary)",
        ...(budget ? { budget: Number(budget) } : {}),
      });
      onSave(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update category");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    setLoading(true);
    try {
      await deleteCategory(category.id);
      onDelete?.(category.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete category");
      setLoading(false);
    }
  }

  if (showDeleteConfirm) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            padding: "1rem",
            background: "var(--color-danger)",
            borderRadius: "0.5rem",
            color: "var(--color-primary-foreground)",
          }}
        >
          <DynamicIcon name="AlertTriangle" size={20} />
          <span>Are you sure? This will delete the category and cannot be undone.</span>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setShowDeleteConfirm(false)}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleDelete}
            disabled={loading}
            style={{ background: "var(--color-danger)" }}
          >
            {loading ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div>
        <label
          style={{
            display: "block",
            fontSize: "0.875rem",
            fontWeight: 500,
            marginBottom: "0.25rem",
            color: "var(--color-foreground-muted)",
          }}
        >
          Category Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter category name"
          autoFocus
          required
        />
      </div>

      <div>
        <label
          style={{
            display: "block",
            fontSize: "0.875rem",
            fontWeight: 500,
            marginBottom: "0.25rem",
            color: "var(--color-foreground-muted)",
          }}
        >
          Icon (Lucide icon name)
        </label>
        <input
          type="text"
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          placeholder="e.g., Shopping, Food, Transport"
        />
      </div>

      <div>
        <label
          style={{
            display: "block",
            fontSize: "0.875rem",
            fontWeight: 500,
            marginBottom: "0.25rem",
            color: "var(--color-foreground-muted)",
          }}
        >
          Color
        </label>
        <input
          type="text"
          value={color}
          onChange={(e) => setColor(e.target.value)}
          placeholder="CSS color value"
        />
      </div>

      <div>
        <label
          style={{
            display: "block",
            fontSize: "0.875rem",
            fontWeight: 500,
            marginBottom: "0.25rem",
            color: "var(--color-foreground-muted)",
          }}
        >
          Monthly Budget (0 for no budget)
        </label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          placeholder="Enter budget amount"
        />
      </div>

      {error && <p style={{ color: "var(--color-danger)", fontSize: "0.875rem", margin: 0 }}>{error}</p>}

      <div style={{ display: "flex", gap: "0.5rem", justifyContent: "space-between" }}>
        {onDelete && (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={loading}
            style={{ color: "var(--color-danger)" }}
          >
            <DynamicIcon name="Trash2" size={16} />
            Delete
          </button>
        )}
        <div style={{ display: "flex", gap: "0.5rem", marginLeft: "auto" }}>
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={loading || !name.trim()}>
            {loading ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </form>
  );
}
