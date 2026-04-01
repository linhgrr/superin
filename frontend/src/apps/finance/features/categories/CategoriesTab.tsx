import { useEffect, useState } from "react";
import type { CreateCategoryRequest } from "@/types/generated/api";
import { createCategory, getCategories, type CategoryRead } from "../../api";
import Modal from "../../components/Modal";
import SimpleForm from "../../components/SimpleForm";

export default function CategoriesTab() {
  const [categories, setCategories] = useState<CategoryRead[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);

  function load() {
    setLoading(true);
    getCategories()
      .then(setCategories)
      .catch(() => {})
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
        <p style={{ color: "var(--color-muted)" }}>Loading…</p>
      ) : categories.length === 0 ? (
        <p style={{ color: "var(--color-muted)" }}>No categories yet.</p>
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
              style={{
                background: "var(--color-surface-elevated)",
                border: "1px solid var(--color-border)",
                borderRadius: "0.75rem",
                padding: "0.875rem",
                display: "flex",
                alignItems: "center",
                gap: "0.625rem",
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
              <div>
                <p style={{ fontWeight: 500, margin: 0, fontSize: "0.875rem" }}>{category.name}</p>
                <p style={{ fontSize: "0.75rem", color: "var(--color-muted)", margin: 0 }}>
                  Budget: ${category.budget.toLocaleString()}
                </p>
              </div>
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
    </div>
  );
}
