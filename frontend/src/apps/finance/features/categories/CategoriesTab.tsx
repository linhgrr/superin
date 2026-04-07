import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import type { CreateCategoryRequest } from "@/types/generated/api";
import { createCategory, getCategories, type CategoryRead } from "../../api";
import Modal from "../../components/Modal";
import SimpleForm from "../../components/SimpleForm";
import CategoryEditForm from "../../components/CategoryEditForm";

export default function CategoriesTab() {
  const [categories, setCategories] = useState<CategoryRead[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<CategoryRead | null>(null);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    getCategories()
      .then(setCategories)
      .catch((error: unknown) => {
        console.error("Failed to load categories", error);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "1rem" }}>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>
          + New Category
        </button>
      </div>

      {loading ? (
        <p style={{ color: "var(--color-foreground-muted)" }}>Loading…</p>
      ) : categories.length === 0 ? (
        <p style={{ color: "var(--color-foreground-muted)" }}>No categories yet.</p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: "0.75rem",
          }}
        >
          {categories.map((category) => (
            <div
              key={category.id}
              onClick={() => setEditingCategory(category)}
              style={{
                background: "var(--color-surface-elevated)",
                border: "1px solid var(--color-border)",
                borderRadius: "0.75rem",
                padding: "0.875rem",
                display: "flex",
                alignItems: "center",
                gap: "0.625rem",
                cursor: "pointer",
                transition: "border-color 0.15s",
              }}
            >
              <div
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "8px",
                  background: category.color,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "0.875rem",
                  flexShrink: 0,
                }}
              >
                {category.icon ? category.icon.slice(0, 1) : category.name.slice(0, 1)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontWeight: 500, margin: 0, fontSize: "0.875rem" }}>{category.name}</p>
                <p style={{ fontSize: "0.75rem", color: "var(--color-foreground-muted)", margin: 0 }}>
                  Budget: ${category.budget.toLocaleString()}
                </p>
              </div>
              <Pencil size={14} style={{ color: "var(--color-foreground-muted)", flexShrink: 0 }} />
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <Modal title="New Category" onClose={() => setShowModal(false)}>
          <SimpleForm
            fields={[
              { label: "Name", key: "name", placeholder: "e.g. Food" },
              { label: "Icon", key: "icon", placeholder: "Tag" },
              { label: "Color", key: "color", placeholder: "oklch(0.65 0.21 280)" },
              { label: "Budget (monthly)", key: "budget", type: "number", placeholder: "0" },
            ]}
            submitLabel="Create Category"
            onSubmit={async (values) => {
              const request: CreateCategoryRequest = {
                name: values.name,
                icon: values.icon || "Tag",
                color: values.color || "oklch(0.65 0.21 280)",
                budget: parseFloat(values.budget) || 0,
              };
              await createCategory(request);
              setShowModal(false);
              load();
            }}
          />
        </Modal>
      )}

      {/* Edit Modal */}
      {editingCategory && (
        <Modal title="Edit Category" onClose={() => setEditingCategory(null)}>
          <CategoryEditForm
            category={editingCategory}
            onSave={(updated) => {
              setCategories((current) =>
                current.map((c) => (c.id === updated.id ? updated : c))
              );
              setEditingCategory(null);
            }}
            onDelete={() => {
              setCategories((current) => current.filter((c) => c.id !== editingCategory.id));
              setEditingCategory(null);
            }}
            onCancel={() => setEditingCategory(null)}
          />
        </Modal>
      )}
    </div>
  );
}
