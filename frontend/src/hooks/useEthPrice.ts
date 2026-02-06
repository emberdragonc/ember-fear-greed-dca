import { useState, useEffect } from 'react';

const FALLBACK_PRICE = 2000;
const CACHE_KEY = 'eth-price-cache';
const CACHE_TTL = 60000; // 1 minute

interface CachedPrice {
  price: number;
  timestamp: number;
}

export function useEthPrice() {
  const [price, setPrice] = useState<number>(FALLBACK_PRICE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchPrice = async () => {
      // Check cache first
      if (typeof window !== 'undefined') {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const { price: cachedPrice, timestamp }: CachedPrice = JSON.parse(cached);
          if (Date.now() - timestamp < CACHE_TTL) {
            setPrice(cachedPrice);
            setLoading(false);
            return;
          }
        }
      }

      try {
        setError(false);
        const response = await fetch(
          'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd',
          { cache: 'no-store' }
        );
        if (!response.ok) throw new Error('Failed to fetch price');
        
        const data = await response.json();
        const newPrice = data.ethereum?.usd || FALLBACK_PRICE;
        setPrice(newPrice);
        
        // Cache the price
        if (typeof window !== 'undefined') {
          localStorage.setItem(CACHE_KEY, JSON.stringify({
            price: newPrice,
            timestamp: Date.now(),
          }));
        }
      } catch (err) {
        console.error('Error fetching ETH price:', err);
        setError(true);
        // Keep using cached/fallback price
      } finally {
        setLoading(false);
      }
    };

    fetchPrice();
    const interval = setInterval(fetchPrice, 60000);
    return () => clearInterval(interval);
  }, []);

  return { price, loading, error };
}
