import { appConfig } from '@config/app.config'
import { formatYearMonth } from '@lib/date-scope'

export function diapersRequestEmail({
    size,
    year,
    month,
}: {
    size: 'M' | 'G' | 'XG'
    year: number
    month: number
}): { subject: string; text: string } {
    const period = formatYearMonth(year, month)
    // Case data, shared by every flow: who receives and who signs the order
    // with the provider. It's not the user who triggered the order via Telegram.
    const patientName = appConfig.PATIENT_NAME
    const deliveryAddress = appConfig.DELIVERY_ADDRESS
    const requesterName = appConfig.REQUESTER_NAME
    const requesterPhoneNumber = appConfig.REQUESTER_PHONE
    return {
        subject: `Pedido de pañales ${period}`,
        text: [
            'Buenos Días,',
            '',
            `Les escribo para organizar la entrega de pañales de ${period} para la paciente ${patientName}`,
            '',
            `Talle: ${size}`,
            `Dirección: ${deliveryAddress}`,
            '',
            'Aguardo respuesta',
            'Gracias.',
            '',
            `${requesterName}`,
            `${requesterPhoneNumber}`,
        ].join('\n'),
    }
}
