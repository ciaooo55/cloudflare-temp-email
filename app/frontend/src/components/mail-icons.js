import { h } from 'vue'

const outlineIcon = (name, path) => ({
  name,
  setup: () => () => h('svg', {
    viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true',
  }, [h('path', { d: path })]),
})

export const CloudDownloadRound = outlineIcon('DownloadIcon', 'M12 3v12m-4-4 4 4 4-4M5 16v4h14v-4')
export const ReplyFilled = outlineIcon('ReplyIcon', 'm9 6-6 6 6 6M3 12h11a6 6 0 0 1 6 6')
export const ForwardFilled = outlineIcon('ForwardIcon', 'm15 6 6 6-6 6M21 12H10a6 6 0 0 0-6 6')
export const FullscreenRound = outlineIcon('ExpandIcon', 'M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6')
export const ImageRound = outlineIcon('ImageIcon', 'M3 4h18v16H3zM3 16l5-5 5 5 4-4 4 4M16 8h.01')
export const ContentCopyOutlined = outlineIcon('CopyIcon', 'M8 8h12v13H8zM16 8V3H3v13h5')
export const LinkRound = outlineIcon('LinkIcon', 'm10 14 4-4M8 16l-1 1a3 3 0 0 1-4-4l4-4a3 3 0 0 1 4 0m2 6a3 3 0 0 0 4 0l4-4a3 3 0 0 0-4-4l-1 1')
export const CodeRound = outlineIcon('CodeIcon', 'm8 7-5 5 5 5m8-10 5 5-5 5M14 4l-4 16')
export const SendRound = outlineIcon('SendIcon', 'm3 3 18 9-18 9 4-9-4-9m4 9h14')
export const CleaningServicesFilled = outlineIcon('CleanIcon', 'm8 14 9-11 4 3-9 11m-4-3-5 3 5 5 4-5M5 18l3 3')
export const AddFilled = outlineIcon('AddIcon', 'M12 5v14M5 12h14')
export const DeleteFilled = outlineIcon('DeleteIcon', 'M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6m4-6v6')
