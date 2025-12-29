export function validateUsdtAddress(
  type: 'TRC20' | 'ERC20' | 'BEP20',
  address: string
): boolean {
  if (!address) return false;

  switch (type) {
    case 'TRC20':
      // Tron addresses start with T
      return /^T[a-zA-Z0-9]{33}$/.test(address);

    case 'ERC20':
    case 'BEP20':
      // Ethereum / BSC
      return /^0x[a-fA-F0-9]{40}$/.test(address);

    default:
      return false;
  }
}
