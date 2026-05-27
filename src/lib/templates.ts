/**
 * Template parameter helpers — pure functions extracted from the legacy wizard.
 * Safe to import from both RSC and client components.
 */

import type { Template } from '@/types'

export type TemplateParamInfo = {
  name: string
  example: string
}

export type RecipientComponentFormatted = {
  type: string
  sub_type?: string
  index?: string
  parameters: Array<{ type: string; parameter_name?: string; text: string }>
}

/**
 * Extract parameter names + examples from a template's component structure.
 * Handles NAMED (body_text_named_params / header_text_named_params) and
 * POSITIONAL (body_text 2D array) formats.
 */
export function getTemplateParameterInfo(template: Template): TemplateParamInfo[] {
  if (!template.components) return []

  // Handle nested structure: components.components
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const componentsArray = (template.components as any).components ?? template.components
  if (!Array.isArray(componentsArray)) return []

  const params: TemplateParamInfo[] = []
  let positionalIndex = 1

  for (const component of componentsArray) {
    if (component.type === 'BODY' || component.type === 'HEADER') {
      if (component.example?.body_text_named_params) {
        for (const param of component.example.body_text_named_params) {
          params.push({ name: param.param_name, example: param.example })
        }
      } else if (component.example?.header_text_named_params) {
        for (const param of component.example.header_text_named_params) {
          params.push({ name: param.param_name, example: param.example })
        }
      } else if (component.example?.body_text?.length > 0) {
        const positionalParams: string[] = component.example.body_text[0] ?? []
        for (const example of positionalParams) {
          params.push({ name: `param${positionalIndex}`, example })
          positionalIndex++
        }
      }
    }

    if (component.type === 'BUTTONS' && component.buttons) {
      for (const button of component.buttons) {
        if (button.example && Array.isArray(button.example)) {
          for (const example of button.example) {
            params.push({ name: `button_param${positionalIndex}`, example })
            positionalIndex++
          }
        }
      }
    }
  }

  return params
}

/**
 * Get parameter example values only (order matches getTemplateParameterInfo).
 */
export function getTemplateParameterExamples(template: Template): string[] {
  return getTemplateParameterInfo(template).map((p) => p.example)
}

/**
 * Convert a flat array of user-supplied values into Kapso/Meta components format.
 * Returns the array to be used as `components` in an AddRecipientsRequest recipient.
 */
export function convertToComponentsFormat(
  template: Template,
  params: string[],
): RecipientComponentFormatted[] {
  const paramInfo = getTemplateParameterInfo(template)
  if (paramInfo.length === 0 || params.length === 0) return []

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const componentsArray = (template.components as any)?.components ?? template.components
  const headerParamNames: string[] = []

  if (Array.isArray(componentsArray)) {
    for (const comp of componentsArray) {
      if (comp.type === 'HEADER' && comp.example?.header_text_named_params) {
        for (const p of comp.example.header_text_named_params) {
          headerParamNames.push(p.param_name)
        }
      }
    }
  }

  const bodyParams: Array<{ type: string; parameter_name?: string; text: string }> = []
  const headerParams: Array<{ type: string; parameter_name?: string; text: string }> = []
  const buttonParams: Array<{ index: number; value: string }> = []

  paramInfo.forEach((info, index) => {
    if (index >= params.length) return
    if (info.name.startsWith('button_param')) {
      buttonParams.push({ index: buttonParams.length, value: params[index] })
      return
    }
    const param = { type: 'text', parameter_name: info.name, text: params[index] }
    if (headerParamNames.includes(info.name)) {
      headerParams.push(param)
    } else {
      bodyParams.push(param)
    }
  })

  const components: RecipientComponentFormatted[] = []
  if (headerParams.length > 0) components.push({ type: 'header', parameters: headerParams })
  if (bodyParams.length > 0) components.push({ type: 'body', parameters: bodyParams })
  for (const bp of buttonParams) {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: String(bp.index),
      parameters: [{ type: 'text', text: bp.value }],
    })
  }

  return components
}

/**
 * Generate a CSV example string for a given template.
 * Header row: phone, <param_names…>
 * Two example rows using template examples.
 */
export function generateCSVExample(template: Template): string {
  const paramInfo = getTemplateParameterInfo(template)
  const headers = ['phone', ...paramInfo.map((p) => p.name)]
  const exampleValues =
    paramInfo.map((p) => p.example).length > 0
      ? paramInfo.map((p) => p.example)
      : Array(paramInfo.length).fill('valor')

  const row1 = ['+5491122334455', ...exampleValues]
  const row2 = ['+5491166778899', ...exampleValues]
  return `${headers.join(',')}\n${row1.join(',')}\n${row2.join(',')}`
}
