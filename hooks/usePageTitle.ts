'use client';

import { useEffect } from 'react';

const SITE_NAME = 'Maries Hair';

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} | Dresses, Electronics, Bags, Shoes & More`;
  }, [title]);
}
