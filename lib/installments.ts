export function getInterestRate(months: number) {
  if (months <= 12) return 0.05;
  if (months <= 24) return 0.1;
  return 0.15;
}

export function calculateInstallment(params: {
  price: number;
  months: number;
  downPayment?: number;
}) {
  const safeDownPayment = Math.max(Number(params.downPayment || 0), 0);
  const downPayment = Math.min(safeDownPayment, params.price);

  const financedAmount = Math.max(params.price - downPayment, 0);
  const interestRate = getInterestRate(params.months);
  const totalWithInterest = financedAmount + financedAmount * interestRate;
  const monthly = totalWithInterest / params.months;

  return {
    downPayment,
    financedAmount,
    interestRate,
    totalWithInterest,
    monthly,
  };
}

export function formatJod(value: number) {
  return `${value.toFixed(2)} د.أ`;
}