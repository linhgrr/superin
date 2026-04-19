/**
 * Subscription API — platform-level subscription state.
 */

import type { SubscriptionRead } from "@/types/generated";
import type {
  CancelSubscriptionResponse,
  CheckoutRequest,
  CheckoutResponse,
} from "@/types/generated";
import { API_PATHS } from "@/constants/api";

import { api } from "./axios";

// GET /api/subscription/subscription
export async function getMySubscription(): Promise<SubscriptionRead> {
  return api.get<SubscriptionRead>(API_PATHS.SUBSCRIPTION_ME);
}

export async function createCheckout(payload: CheckoutRequest): Promise<CheckoutResponse> {
  return api.post<CheckoutResponse>(
    API_PATHS.SUBSCRIPTION_CHECKOUT,
    payload,
  );
}

export async function cancelMySubscription(): Promise<CancelSubscriptionResponse> {
  return api.post<CancelSubscriptionResponse>(
    API_PATHS.SUBSCRIPTION_CANCEL,
    {},
  );
}
