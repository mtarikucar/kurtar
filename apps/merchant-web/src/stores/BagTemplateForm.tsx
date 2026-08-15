import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import type {
  BagCategory,
  BagTemplate,
  DietFlag,
  Store,
} from "../api/response-types";
import { getErrorMessage } from "../shared/errors";
import { formatKurus } from "../shared/format";
import {
  BAG_PRICE_FLOOR_CENTS,
  centsToTryInput,
  parseTryToCents,
  validateBagPricing,
} from "../shared/money";
import { Button } from "../shared/ui/Button";
import { TextField } from "../shared/ui/TextField";
import { SelectField } from "../shared/ui/SelectField";
import { Checkbox } from "../shared/ui/Checkbox";
import { Banner } from "../shared/ui/Banner";
import { useCreateBagTemplate, useUpdateBagTemplate } from "./hooks";
import styles from "./StoresPage.module.css";

const CATEGORIES: BagCategory[] = [
  "MEAL",
  "BAKERY",
  "GROCERY",
  "PRODUCE",
  "OTHER",
];
const DIET_FLAGS: DietFlag[] = [
  "VEGETARIAN",
  "VEGAN",
  "GLUTEN_FREE",
  "LACTOSE_FREE",
];

export interface BagTemplateFormProps {
  template?: BagTemplate;
  stores: Store[];
  onSaved: () => void;
  onCancel: () => void;
}

/** Create/edit a BagTemplate. Two rules get extra visual weight because
 * they are the two ways this form can quietly hurt the business: the
 * allergen disclaimer is a LEGAL requirement (never a silently-optional
 * field), and the price floor is a PLATFORM economics requirement,
 * enforced client-side with an explanation before the merchant ever hits
 * the server's 400. */
export function BagTemplateForm({
  template,
  stores,
  onSaved,
  onCancel,
}: BagTemplateFormProps) {
  const { t } = useTranslation(["stores", "common", "errors"]);
  const isEdit = Boolean(template);
  const createTemplate = useCreateBagTemplate();
  const updateTemplate = useUpdateBagTemplate();

  const [storeId, setStoreId] = useState(
    template?.storeId ?? stores[0]?.id ?? "",
  );
  const [title, setTitle] = useState(template?.title ?? "");
  const [category, setCategory] = useState<BagCategory>(
    template?.category ?? "MEAL",
  );
  const [dietFlags, setDietFlags] = useState<DietFlag[]>(
    template?.dietFlags ?? [],
  );
  const [allergenDisclaimer, setAllergenDisclaimer] = useState(
    template?.allergenDisclaimer ?? "",
  );
  const [valueMin, setValueMin] = useState(
    template ? centsToTryInput(template.originalValueCentsMin) : "",
  );
  const [valueMax, setValueMax] = useState(
    template ? centsToTryInput(template.originalValueCentsMax) : "",
  );
  const [price, setPrice] = useState(
    template ? centsToTryInput(template.priceCents) : "",
  );
  const [description, setDescription] = useState(template?.description ?? "");
  const [active, setActive] = useState(template?.active ?? true);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const submitting = createTemplate.isPending || updateTemplate.isPending;

  function toggleDiet(flag: DietFlag) {
    setDietFlags((prev) =>
      prev.includes(flag) ? prev.filter((f) => f !== flag) : [...prev, flag],
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitError(null);

    const errors: Record<string, string> = {};
    const required = t("common:validation.required");
    if (!storeId) errors.storeId = required;
    if (!title.trim()) errors.title = required;
    if (!allergenDisclaimer.trim()) errors.allergenDisclaimer = required;

    const valueMinCents = parseTryToCents(valueMin);
    const valueMaxCents = parseTryToCents(valueMax);
    const priceCents = parseTryToCents(price);
    if (valueMinCents === null) errors.valueMin = required;
    if (valueMaxCents === null) errors.valueMax = required;
    if (priceCents === null) errors.price = required;

    if (
      valueMinCents !== null &&
      valueMaxCents !== null &&
      priceCents !== null
    ) {
      const pricing = validateBagPricing({
        priceCents,
        originalValueCentsMin: valueMinCents,
        originalValueCentsMax: valueMaxCents,
      });
      if (pricing.priceBelowFloor) {
        errors.price = t("stores:templates.priceFloorNote", {
          floor: formatKurus(BAG_PRICE_FLOOR_CENTS),
        });
      } else if (pricing.priceNotBelowValue) {
        errors.price = t("errors:codes.BAG_PRICE_NOT_BELOW_VALUE");
      }
      if (pricing.valueBandInvalid) {
        errors.valueMax = t("errors:codes.BAG_VALUE_BAND_INVALID");
      }
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const values = {
      storeId,
      title: title.trim(),
      category,
      dietFlags,
      allergenDisclaimer: allergenDisclaimer.trim(),
      originalValueCentsMin: valueMinCents as number,
      originalValueCentsMax: valueMaxCents as number,
      priceCents: priceCents as number,
      description: description.trim() || undefined,
    };

    try {
      if (isEdit && template) {
        await updateTemplate.mutateAsync({
          id: template.id,
          values: { ...values, active },
        });
      } else {
        await createTemplate.mutateAsync(values);
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
          ? t("stores:templates.form.titleEdit")
          : t("stores:templates.form.titleNew")}
      </h2>
      {submitError ? <Banner tone="danger">{submitError}</Banner> : null}

      {!isEdit ? (
        <SelectField
          label={t("stores:templates.form.store")}
          required
          value={storeId}
          error={fieldErrors.storeId}
          onChange={(e) => setStoreId(e.target.value)}
        >
          {stores.map((store) => (
            <option key={store.id} value={store.id}>
              {store.name}
            </option>
          ))}
        </SelectField>
      ) : null}

      <TextField
        label={t("stores:templates.form.titleField")}
        required
        value={title}
        error={fieldErrors.title}
        onChange={(e) => setTitle(e.target.value)}
      />

      <SelectField
        label={t("stores:templates.form.category")}
        required
        value={category}
        onChange={(e) => setCategory(e.target.value as BagCategory)}
      >
        {CATEGORIES.map((cat) => (
          <option key={cat} value={cat}>
            {t(`stores:templates.categories.${cat}`)}
          </option>
        ))}
      </SelectField>

      <div>
        <span>{t("stores:templates.form.dietFlags")}</span>
        <div className={styles.checkboxGroup}>
          {DIET_FLAGS.map((flag) => (
            <Checkbox
              key={flag}
              label={t(`stores:templates.diet.${flag}`)}
              checked={dietFlags.includes(flag)}
              onChange={() => toggleDiet(flag)}
            />
          ))}
        </div>
      </div>

      <Banner tone="warning">
        {t("stores:templates.form.allergenRequired")}
      </Banner>
      <TextField
        label={t("stores:templates.form.allergenDisclaimer")}
        hint={t("stores:templates.form.allergenHint")}
        required
        multiline
        rows={3}
        value={allergenDisclaimer}
        error={fieldErrors.allergenDisclaimer}
        onChange={(e) => setAllergenDisclaimer(e.target.value)}
      />

      <div className={styles.row}>
        <TextField
          label={t("stores:templates.form.valueMin")}
          required
          inputMode="decimal"
          value={valueMin}
          error={fieldErrors.valueMin}
          onChange={(e) => setValueMin(e.target.value)}
        />
        <TextField
          label={t("stores:templates.form.valueMax")}
          required
          inputMode="decimal"
          value={valueMax}
          error={fieldErrors.valueMax}
          onChange={(e) => setValueMax(e.target.value)}
        />
      </div>

      <TextField
        label={t("stores:templates.form.price")}
        hint={t("stores:templates.form.priceHint", {
          floor: formatKurus(BAG_PRICE_FLOOR_CENTS),
        })}
        required
        inputMode="decimal"
        value={price}
        error={fieldErrors.price}
        onChange={(e) => setPrice(e.target.value)}
      />

      <TextField
        label={t("stores:templates.form.description")}
        multiline
        rows={2}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />

      {isEdit ? (
        <Checkbox
          label={t("stores:templates.form.active")}
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
            ? t("stores:templates.form.saving")
            : t("stores:templates.form.save")}
        </Button>
      </div>
    </form>
  );
}
