import { computed } from 'vue'
import {
  useTenantConfigVersion,
  getCurrencyUnit,
  getCurrencySymbol,
  getCurrencyUnitLabel
} from '@/config/tenant'
import { formatMoney, formatMoneyAmount } from '@/utils/format'

/**
 * 租户计价货币展示 composable
 * 依赖租户配置版本号（brand-config 拉取后 bump），货币单位变更时自动重算；
 * 金额一律为分（USD 租户即美分），不做汇率换算。
 */
export function useCurrencyDisplay() {
  const version = useTenantConfigVersion()

  const unit = computed(() => {
    void version.value
    return getCurrencyUnit()
  })
  const symbol = computed(() => {
    void version.value
    return getCurrencySymbol()
  })
  const unitLabel = computed(() => {
    void version.value
    return getCurrencyUnitLabel()
  })

  const formatMoneyWithUnit = (amountInCents) => formatMoney(amountInCents, unit.value)
  const formatAmountWithUnit = (amountInCents) => formatMoneyAmount(amountInCents)

  return { unit, symbol, unitLabel, formatMoney: formatMoneyWithUnit, formatMoneyAmount: formatAmountWithUnit }
}
