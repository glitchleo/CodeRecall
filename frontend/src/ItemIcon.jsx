import React from 'react';
import { getIconForItem } from './lib/icons.js';
import './icons.css';

export default function ItemIcon({ item, size = 18, className = '' }) {
  const icon = getIconForItem(item);
  return <span className={`item-icon asset-item-icon ${className}`} style={{ width: size, height: size }} aria-hidden="true">
    <img src={icon.src} width={size} height={size} alt="" draggable="false" />
  </span>;
}
