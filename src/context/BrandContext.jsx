/*
 * Marca do box (white-label): troca cores e logo da DS Agende pelas do cliente.
 *
 * Qual box: ?box=<uuid> na URL ou VITE_DEFAULT_BOX_ID no .env.
 * Sem Supabase, sem box ou se a busca falhar → fica a marca DS Agende (ex.: GitHub Pages).
 *
 * Uso:
 *   <BrandProvider> … </BrandProvider>
 *   const brand = useBrand() // null = marca DS | { id, name, logos } (logos null → monograma)
 */
import { createContext, useContext, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { boxLogos, brandCss } from '../lib/brand'
import { PRESETS } from '../lib/boxPresets'

const BrandContext = createContext(null)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function BrandProvider({ children }) {
  const [params] = useSearchParams()
  const fromUrl = params.get('box')
  // ?box=icara → box pré-configurado (src/lib/boxPresets.js), sem buscar no Supabase
  const preset = PRESETS[fromUrl] || null
  const boxId = UUID.test(fromUrl || '') ? fromUrl : import.meta.env.VITE_DEFAULT_BOX_ID
  const [fetched, setBrand] = useState(null)
  const brand = preset
    ? { id: preset.boxId || null, name: preset.name, primary: preset.primary, secondary: preset.secondary, logos: preset.boxId ? boxLogos(preset.boxId) : null, monogram: preset.monogram }
    : fetched

  useEffect(() => {
    if (preset || !supabase || !UUID.test(boxId || '')) return
    let alive = true
    supabase.rpc('get_box_branding', { p_box: boxId }).then(({ data, error }) => {
      if (!alive) return
      const box = data?.[0]
      if (error || !box) {
        if (import.meta.env.DEV) console.warn('[marca] box não encontrado, usando a marca DS Agende.', error?.message || boxId)
        return
      }
      setBrand({ id: box.id, name: box.name, primary: box.brand_primary, secondary: box.brand_secondary, logos: boxLogos(box.id) })
    })
    return () => {
      alive = false
    }
  }, [boxId, preset])

  // Cores: um <style> no fim do <head> sobrepõe os tokens; sai junto com a página
  useEffect(() => {
    const css = brand ? brandCss(brand.primary, brand.secondary) : ''
    if (!css) return
    const el = document.createElement('style')
    el.id = 'box-brand'
    el.textContent = css
    document.head.appendChild(el)
    return () => el.remove()
  }, [brand?.primary, brand?.secondary])

  return <BrandContext.Provider value={brand}>{children}</BrandContext.Provider>
}

export const useBrand = () => useContext(BrandContext)
