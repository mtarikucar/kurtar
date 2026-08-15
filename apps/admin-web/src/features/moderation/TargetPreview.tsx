import { useTranslation } from "react-i18next";
import { useStoreTargetPreview } from "./useReports";
import type { ReportTargetType } from "../../api/admin-types";
import styles from "./TargetPreview.module.css";

export interface TargetPreviewProps {
  targetType: ReportTargetType;
  targetId: string;
}

/**
 * STORE targets get a real preview via the @Public discovery endpoint
 * (GET /discovery/stores/{id}) — the only admin-reachable single-resource
 * lookup for any report target type. OFFER and RATING fall back to
 * ID-only: no equivalent lookup exists anywhere in this API for either
 * (see useReports.ts's useStoreTargetPreview doc comment). This is an
 * honest scope limit, not an oversight.
 */
export function TargetPreview({ targetType, targetId }: TargetPreviewProps) {
  const { t } = useTranslation("moderation");
  const preview = useStoreTargetPreview(targetId, targetType);

  if (targetType !== "STORE") {
    return (
      <div className={styles.preview}>
        <span className={styles.badge}>{t(`target.${targetType}`)}</span>
        <span className={styles.id}>
          {t("target.idLabel", { id: targetId })}
        </span>
        <span className={styles.unavailable}>
          {t("target.previewUnavailable")}
        </span>
      </div>
    );
  }

  if (preview.isLoading)
    return (
      <span className={styles.id}>{t("target.idLabel", { id: targetId })}</span>
    );

  if (preview.isError || !preview.data) {
    return (
      <div className={styles.preview}>
        <span className={styles.badge}>{t("target.STORE")}</span>
        <span className={styles.id}>
          {t("target.idLabel", { id: targetId })}
        </span>
      </div>
    );
  }

  const { store } = preview.data;
  return (
    <div className={styles.preview}>
      <span className={styles.badge}>{t("target.STORE")}</span>
      <span className={styles.storeName}>{store.name}</span>
      <span className={styles.storeAddress}>
        {t("target.storeAddress", {
          address: store.address,
          district: store.district,
          city: store.city,
        })}
      </span>
    </div>
  );
}
