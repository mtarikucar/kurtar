import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { BagTemplate, Store } from "../api/response-types";
import { useBagTemplates, useStores } from "../shared/entityQueries";
import { getErrorMessage } from "../shared/errors";
import { formatKurus } from "../shared/format";
import { Banner } from "../shared/ui/Banner";
import { Button } from "../shared/ui/Button";
import { Spinner } from "../shared/ui/Spinner";
import { StatusPill } from "../shared/ui/StatusPill";
import { BagTemplateForm } from "./BagTemplateForm";
import { StoreForm } from "./StoreForm";
import styles from "./StoresPage.module.css";

type Tab = "stores" | "templates";
type Editing<T> = T | "new" | null;

export function StoresPage() {
  const { t } = useTranslation(["stores", "common"]);
  const [tab, setTab] = useState<Tab>("stores");
  const [editingStore, setEditingStore] = useState<Editing<Store>>(null);
  const [editingTemplate, setEditingTemplate] =
    useState<Editing<BagTemplate>>(null);

  const storesQuery = useStores();
  const templatesQuery = useBagTemplates();

  if (storesQuery.isPending || templatesQuery.isPending) return <Spinner />;

  if (storesQuery.isError) {
    return (
      <Banner
        tone="danger"
        action={
          <Button onClick={() => void storesQuery.refetch()}>
            {t("common:actions.retry")}
          </Button>
        }
      >
        {getErrorMessage(storesQuery.error, t)}
      </Banner>
    );
  }
  if (templatesQuery.isError) {
    return (
      <Banner
        tone="danger"
        action={
          <Button onClick={() => void templatesQuery.refetch()}>
            {t("common:actions.retry")}
          </Button>
        }
      >
        {getErrorMessage(templatesQuery.error, t)}
      </Banner>
    );
  }

  const stores = storesQuery.data ?? [];
  const templates = templatesQuery.data ?? [];

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>{t("stores:title")}</h1>

      <div className={styles.tabs} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "stores"}
          className={[
            styles.tab,
            tab === "stores" ? styles.tabActive : "",
          ].join(" ")}
          onClick={() => setTab("stores")}
        >
          {t("stores:tabs.stores")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "templates"}
          className={[
            styles.tab,
            tab === "templates" ? styles.tabActive : "",
          ].join(" ")}
          onClick={() => setTab("templates")}
        >
          {t("stores:tabs.templates")}
        </button>
      </div>

      {tab === "stores" ? (
        editingStore ? (
          <StoreForm
            store={editingStore === "new" ? undefined : editingStore}
            onSaved={() => setEditingStore(null)}
            onCancel={() => setEditingStore(null)}
          />
        ) : (
          <>
            <Button onClick={() => setEditingStore("new")}>
              {t("stores:stores.addCta")}
            </Button>
            {stores.length === 0 ? (
              <Banner tone="neutral" heading={t("stores:stores.empty.heading")}>
                {t("stores:stores.empty.body")}
              </Banner>
            ) : (
              <div className={styles.list}>
                {stores.map((store) => (
                  <button
                    key={store.id}
                    type="button"
                    className={styles.listItem}
                    onClick={() => setEditingStore(store)}
                  >
                    <div className={styles.listItemHead}>
                      <span className={styles.listItemTitle}>{store.name}</span>
                      <StatusPill tone={store.active ? "success" : "neutral"}>
                        {t(
                          store.active
                            ? "common:status.active"
                            : "common:status.inactive",
                        )}
                      </StatusPill>
                    </div>
                    <span className={styles.listItemMeta}>
                      {store.district}, {store.city}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </>
        )
      ) : editingTemplate ? (
        <BagTemplateForm
          template={editingTemplate === "new" ? undefined : editingTemplate}
          stores={stores}
          onSaved={() => setEditingTemplate(null)}
          onCancel={() => setEditingTemplate(null)}
        />
      ) : (
        <>
          {stores.length === 0 ? (
            <Banner tone="warning">{t("stores:stores.empty.body")}</Banner>
          ) : (
            <Button onClick={() => setEditingTemplate("new")}>
              {t("stores:templates.addCta")}
            </Button>
          )}
          {templates.length === 0 ? (
            <Banner
              tone="neutral"
              heading={t("stores:templates.empty.heading")}
            >
              {t("stores:templates.empty.body")}
            </Banner>
          ) : (
            <div className={styles.list}>
              {templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className={styles.listItem}
                  onClick={() => setEditingTemplate(template)}
                >
                  <div className={styles.listItemHead}>
                    <span className={styles.listItemTitle}>
                      {template.title}
                    </span>
                    <StatusPill tone={template.active ? "success" : "neutral"}>
                      {t(
                        template.active
                          ? "common:status.active"
                          : "common:status.inactive",
                      )}
                    </StatusPill>
                  </div>
                  <span className={styles.listItemMeta}>
                    {formatKurus(template.priceCents)} ·{" "}
                    {t(`stores:templates.categories.${template.category}`)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
