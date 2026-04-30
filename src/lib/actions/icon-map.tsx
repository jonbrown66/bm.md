import type { ComponentType } from 'react'
import {
  BookOpen,
  CloudUpload,
  Code,
  Code2,
  Coffee,
  ExternalLink,
  FileDown,
  FileText,
  FileUp,
  Github,
  ImageDown,
  Link,
  Monitor,
  Moon,
  Palette,
  Printer,
  RefreshCw,
  Smartphone,
  Sun,
  Twitter,
  Wand,
} from 'lucide-react'
import JuejinIcon from '@/icons/juejin'
import MCPIcon from '@/icons/mcp'
import SkillIcon from '@/icons/skill'
import WechatIcon from '@/icons/wechat'
import ZhihuIcon from '@/icons/zhihu'

const iconMap = {
  BookOpen,
  CloudUpload,
  Code,
  Code2,
  Coffee,
  ExternalLink,
  FileDown,
  FileText,
  FileUp,
  Github,
  ImageDown,
  Link,
  Monitor,
  Moon,
  Palette,
  Printer,
  RefreshCw,
  Smartphone,
  Sun,
  Twitter,
  Wand,
  Wechat: WechatIcon,
  Zhihu: ZhihuIcon,
  Juejin: JuejinIcon,
  MCP: MCPIcon,
  Skill: SkillIcon,
} as const

export type IconName = keyof typeof iconMap

export type IconComponent = ComponentType<{ className?: string }>

export function getIcon(name: IconName): IconComponent {
  return iconMap[name]
}

export { iconMap }
