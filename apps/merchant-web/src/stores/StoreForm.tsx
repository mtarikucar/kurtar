import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type { Store } from "../api/response-types";
import { getErrorMessage } from "../shared/errors";
import { Button } from "../shared/ui/Button";
import { TextField } from "../shared/ui/TextField";
import { Checkbox } from "../shared/ui/Checkbox";
import { Banner } from "../shared/ui/Banner";
import { useCreateStore, useUpdateStore } from "./hooks";
import styles from "./StoresPage.module.css";

export interface StoreFormProps {
  store?: Store;
  onSaved: () => void;
  onCancel: () => void;
}

export function StoreForm({ store, onSaved, onCancel }: StoreFormProps) {
  const { t } = useTranslation(["stores", "common"]);
  const isEdit = Boolean(store);
  const createStore = useCreateStore();
  const updateStore = useUpdateStore();

  const [name, setName] = useState(store?.name ?? "");
  const [address, setAddress] = useState(store?.address ?? "");
  const [district, setDistrict] = useState(store?.district ?? "");
  const [city, setCity] = useState(store?.city ?? "");
  const [latitude, setLatitude] = useState(store ? String(store.latitude) : "");
  const [longitude, setLongitude] = useState(
    store ? String(store.longitude) : "",
  );
  const [active, setActive] = useState(store?.active ?? true);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const submitting = createStore.isPending || updateStore.isPending;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitError(null);

    const lat = Number(latitude.replace(",", "."));
    const lng = Number(longitude.replace(",", "."));
    const errors: Record<string, string> = {};
    const required = t("common:validation.required");
    if (!name.trim()) errors.name = required;
    if (!address.trim()) errors.address = required;
    if (!district.trim()) errors.district = required;
    if (!city.trim()) errors.city = required;
    if (!Number.isFinite(lat)) errors.latitude = required;
    if (!Number.isFinite(lng)) errors.longitude = required;
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    try {
      if (isEdit && store) {
        await updateStore.mutateAsync({
          id: store.id,
          values: {
            name,
            address,
            district,
            city,
            latitude: lat,
            longitude: lng,
            active,
          },
        });
      } else {
        await createStore.mutateAsync({
          name,
          address,
          district,
          city,
          latitude: lat,
          longitude: lng,
        });
      }
      onSaved();
    } catch (err) {
      setSubmitError(getErrorMessage(err, t));
    }
  }

  return (
    <form
      className={styles.form}
      onSubmit={(e) => void handleSubmit(e)}
      noValidate
    >
      <h2>
        {isEdit
          ? t("stores:stores.form.titleEdit")
          : t("stores:stores.form.titleNew")}
      </h2>
      {submitError ? <Banner tone="danger">{submitError}</Banner> : null}

      <TextField
        label={t("stores:stores.form.name")}
        required
        value={name}
        error={fieldErrors.name}
        onChange={(e) => setName(e.target.value)}
      />
      <TextField
        label={t("stores:stores.form.address")}
        required
        value={address}
        error={fieldErrors.address}
        onChange={(e) => setAddress(e.target.value)}
      />
      <div className={styles.row}>
        <TextField
          label={t("stores:stores.form.district")}
          required
          value={district}
          error={fieldErrors.district}
          onChange={(e) => setDistrict(e.target.value)}
        />
        <TextField
          label={t("stores:stores.form.city")}
          required
          value={city}
          error={fieldErrors.city}
          onChange={(e) => setCity(e.target.value)}
        />
      </div>
      <div className={styles.row}>
        <TextField
          label={t("stores:stores.form.latitude")}
          required
          inputMode="decimal"
          value={latitude}
          error={fieldErrors.latitude}
          onChange={(e) => setLatitude(e.target.value)}
        />
        <TextField
          label={t("stores:stores.form.longitude")}
          required
          inputMode="decimal"
          value={longitude}
          error={fieldErrors.longitude}
          onChange={(e) => setLongitude(e.target.value)}
        />
      </div>
      <p>{t("stores:stores.form.coordinatesHint")}</p>

      {isEdit ? (
        <Checkbox
          label={
            <>
              {t("stores:stores.form.active")}
              <br />
              <small>{t("stores:stores.form.activeHint")}</small>
            </>
          }
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
        />
      ) : null}

      <div className={styles.formActions}>
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={submitting}
        >
          {t("common:actions.cancel")}
        </Button>
        <Button type="submit" loading={submitting}>
          {submitting
            ? t("stores:stores.form.saving")
            : t("stores:stores.form.save")}
        </Button>
      </div>
    </form>
  );
}
