import { z } from "zod";

/**
 * Shared Zod schemas for every server function that accepts user input.
 * Bangladesh-shaped: phone defaults to +880, country defaults to "BD",
 * postal code is numeric (BD post codes are 4 digits) but kept loose enough
 * to accept the wider "PIN/ZIP" formats we might see from edge cases.
 */

export const phoneSchema = z
  .string()
  .trim()
  .min(7, "Enter a valid phone number")
  .max(20, "Phone number is too long");

export const addressInputSchema = z.object({
  label: z.string().trim().min(1).max(40).default("Home"),
  name: z.string().trim().min(2, "Name is required").max(120),
  phone: phoneSchema,
  line1: z.string().trim().min(4, "Address is required").max(240),
  line2: z.string().trim().max(240).optional().nullable(),
  city: z.string().trim().min(2, "City is required").max(120),
  state: z.string().trim().min(2, "District is required").max(120),
  pincode: z.string().trim().min(3, "Post code is required").max(12),
  country: z.string().trim().length(2).default("BD"),
  isDefault: z.boolean().optional().default(false),
});

export const addressUpdateSchema = addressInputSchema.partial().extend({
  id: z.string().uuid(),
});

export const cartAddSchema = z.object({
  variantId: z.string().uuid(),
  qty: z.number().int().min(1).max(20).default(1),
});

export const cartSetQtySchema = z.object({
  variantId: z.string().uuid(),
  qty: z.number().int().min(0).max(20),
});

export const cartRemoveSchema = z.object({
  variantId: z.string().uuid(),
});

export const cartMergeSchema = z.object({
  lines: z
    .array(z.object({ variantId: z.string().uuid(), qty: z.number().int().min(1).max(20) }))
    .max(100),
});

export const wishlistToggleSchema = z.object({
  productId: z.string().uuid(),
});

export const checkoutCustomerSchema = z.object({
  name: z.string().trim().min(2, "Full name is required").max(120),
  email: z.string().trim().email("Enter a valid email"),
  phone: phoneSchema,
});

export const checkoutAddressSchema = z.object({
  line1: z.string().trim().min(4, "Address is required").max(240),
  line2: z.string().trim().max(240).optional().nullable(),
  city: z.string().trim().min(2, "City is required").max(120),
  state: z.string().trim().min(2, "District is required").max(120),
  pincode: z.string().trim().min(3, "Post code is required").max(12),
  country: z.string().trim().length(2).default("BD"),
});

export const paymentMethodSchema = z.enum(["cod", "bkash"]);

export const checkoutSchema = z.object({
  addressId: z.string().uuid().optional(),
  customer: checkoutCustomerSchema,
  shippingAddress: checkoutAddressSchema,
  couponCode: z.string().trim().max(40).optional().nullable(),
  paymentMethod: paymentMethodSchema,
});

export const cancelOrderSchema = z.object({
  reference: z.string().trim().min(3).max(60),
});

const CANCEL_REASONS = ["changed_mind", "ordered_by_mistake", "found_better_price", "other"] as const;

export const orderTokenLookupSchema = z.object({
  reference: z.string().trim().min(3).max(60),
  token: z.string().trim().max(128).optional(),
});

export const guestCancelOrderSchema = z.object({
  reference: z.string().trim().min(3).max(60),
  token: z.string().trim().max(128).optional(),
  reason: z.enum(CANCEL_REASONS).optional(),
});

export const resendTrackingLinkSchema = z.object({
  reference: z.string().trim().min(3).max(60),
  email: z.string().trim().email("Enter a valid email"),
});

export const adminSetShipmentSchema = z.object({
  orderId: z.string().uuid(),
  courier: z.string().trim().max(80).optional().nullable(),
  trackingNumber: z.string().trim().max(120).optional().nullable(),
});

export const adminMarkCodCollectedSchema = z.object({
  orderId: z.string().uuid(),
});

export const reviewInputSchema = z.object({
  productId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(120).optional().default(""),
  body: z.string().trim().min(4, "Tell us a little more").max(2000),
});

export const profileUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  phone: phoneSchema.optional(),
  dateOfBirth: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .optional()
    .nullable(),
});

/* -------------------------------------------------------- SAAJ Club ---- */

export const membershipJoinSchema = z.object({
  customer: checkoutCustomerSchema,
  tier: z.enum(["CLUB"]).default("CLUB"),
});

export const membershipCancelSchema = z.object({
  immediate: z.boolean().optional().default(false),
});

export const membershipConfigUpdateSchema = z.object({
  monthlyPrice: z.number().min(0).max(1_000_000).optional(),
  memberDiscountPercent: z.number().min(0).max(100).optional(),
  pointsPer100Bdt: z.number().min(0).max(1000).optional(),
  rewardPointsEnabled: z.boolean().optional(),
  birthdayRewardPoints: z.number().int().min(0).max(1_000_000).optional(),
  gracePeriodDays: z.number().int().min(0).max(90).optional(),
});

export const adminMembershipSetSchema = z.object({
  userId: z.string().uuid(),
  status: z.enum(["ACTIVE", "EXPIRED", "CANCELLED"]),
  periodEnd: z.string().datetime().optional().nullable(),
  reason: z.string().trim().min(3, "A reason is required").max(300),
});

export const adminRewardAdjustSchema = z.object({
  userId: z.string().uuid(),
  points: z
    .number()
    .int()
    .refine((n) => n !== 0, "Adjustment cannot be zero")
    .refine((n) => Math.abs(n) <= 1_000_000, "Adjustment is too large"),
  reason: z.string().trim().min(3, "A reason is required").max(300),
});

export const adminMemberDetailSchema = z.object({ userId: z.string().uuid() });

/* ------------------------------------------------------------ admin ---- */

export const adminVariantSchema = z.object({
  size: z.string().trim().min(1).max(40),
  stock: z.number().int().min(0).max(100000),
});

export const adminImageUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  contentType: z.enum(["image/jpeg", "image/png", "image/webp", "image/gif"]),
  // ~8MB file cap (base64 runs ~4/3 the raw byte size).
  base64: z.string().min(1).max(11_000_000),
});

export const adminImageSchema = z.object({
  url: z.string().trim().min(1).max(2000),
  alt: z.string().trim().max(200).optional().nullable(),
  isPrimary: z.boolean().optional().default(false),
});

export const adminProductInputSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase, letters/numbers, hyphen-separated"),
  categorySlug: z.string().trim().min(1),
  price: z.number().min(0).max(10_000_000),
  discountPrice: z.number().min(0).max(10_000_000).optional().nullable(),
  sku: z.string().trim().min(1).max(120),
  description: z.string().trim().max(5000).optional().default(""),
  materials: z.array(z.string().trim().max(200)).max(50).default([]),
  tags: z.array(z.string().trim().max(60)).max(50).default([]),
  isNew: z.boolean().default(false),
  status: z.enum(["draft", "active", "archived"]).default("active"),
  images: z.array(adminImageSchema).max(20).default([]),
  variants: z.array(adminVariantSchema).max(30).default([]),
  // SAAJ Club
  membersOnly: z.boolean().default(false),
  memberDiscountEligible: z.boolean().default(true),
  memberDiscountPercent: z.number().min(0).max(100).optional().nullable(),
  availableFrom: z.string().datetime().optional().nullable(),
  memberAvailableFrom: z.string().datetime().optional().nullable(),
});

export const adminProductUpdateSchema = adminProductInputSchema.partial().extend({
  id: z.string().uuid(),
});

export const adminStockUpdateSchema = z.object({
  productId: z.string().uuid(),
  variants: z.array(adminVariantSchema).min(1).max(30),
});

export const adminOrderStatusSchema = z.object({
  orderId: z.string().uuid(),
  status: z.enum([
    "pending",
    "processing",
    "paid",
    "shipped",
    "delivered",
    "cancelled",
    "refunded",
  ]),
});

export type AddressInput = z.infer<typeof addressInputSchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;
export type AdminProductInput = z.infer<typeof adminProductInputSchema>;
