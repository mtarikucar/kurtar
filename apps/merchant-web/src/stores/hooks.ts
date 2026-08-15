import { useMutation, useQueryClient } from "@tanstack/react-query";
import { client } from "../api/client";
import { asResponse } from "../api/response-types";
import type {
  BagCategory,
  BagTemplate,
  DietFlag,
  Store,
} from "../api/response-types";
import { bagTemplatesKey, storesKey } from "../shared/entityQueries";

export interface StoreFormValues {
  name: string;
  address: string;
  district: string;
  city: string;
  latitude: number;
  longitude: number;
  active: boolean;
}

export function useCreateStore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: Omit<StoreFormValues, "active">) =>
      asResponse<Store>(await client.merchant.stores.create(values)),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: storesKey }),
  });
}

export function useUpdateStore() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string;
      values: StoreFormValues;
    }) => asResponse<Store>(await client.merchant.stores.update(id, values)),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: storesKey }),
  });
}

export interface BagTemplateFormValues {
  storeId: string;
  title: string;
  category: BagCategory;
  dietFlags: DietFlag[];
  allergenDisclaimer: string;
  originalValueCentsMin: number;
  originalValueCentsMax: number;
  priceCents: number;
  description?: string;
}

export function useCreateBagTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (values: BagTemplateFormValues) =>
      asResponse<BagTemplate>(
        await client.merchant.bagTemplates.create(values),
      ),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: bagTemplatesKey }),
  });
}

export function useUpdateBagTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string;
      values: BagTemplateFormValues & { active: boolean };
    }) =>
      asResponse<BagTemplate>(
        await client.merchant.bagTemplates.update(id, values),
      ),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: bagTemplatesKey }),
  });
}

export function useDeactivateBagTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      asResponse<BagTemplate>(
        await client.merchant.bagTemplates.deactivate(id),
      ),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: bagTemplatesKey }),
  });
}
