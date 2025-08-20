export class PaymentMethodDto {
  id: string;
  brand: string;
  last4: string;
  exp_month: number;
  exp_year: number;
  is_default: boolean;
}

export class PaymentMethodsResponseDto {
  status: string;
  data: {
    payment_methods: PaymentMethodDto[];
  };
}