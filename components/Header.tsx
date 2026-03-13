'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import MiniCart from './MiniCart';
import { useCart } from '@/context/CartContext';
import { supabase } from '@/lib/supabase';
import { useCMS } from '@/context/CMSContext';

export default function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [wishlistCount, setWishlistCount] = useState(0);
  const [user, setUser] = useState<any>(null);

  const { cartCount, isCartOpen, setIsCartOpen } = useCart();
  const { getSetting } = useCMS();

  const siteName = getSetting('site_name') || 'Maries Hair';
  const headerLogo = getSetting('site_logo') || '/logo.png';

  useEffect(() => {
    // Wishlist logic
    const updateWishlistCount = () => {
      const wishlist = JSON.parse(localStorage.getItem('wishlist') || '[]');
      setWishlistCount(wishlist.length);
    };

    updateWishlistCount();
    window.addEventListener('wishlistUpdated', updateWishlistCount);

    // Auth logic
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
    };

    checkUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      window.removeEventListener('wishlistUpdated', updateWishlistCount);
      subscription.unsubscribe();
    };
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      window.location.href = `/shop?search=${encodeURIComponent(searchQuery)}`;
    }
  };

  return (
    <>
      <header className="bg-white sticky top-0 z-50 border-b border-gray-100 transition-all duration-300">
        <div className="safe-area-top" />
        <nav aria-label="Main navigation" className="relative">
          <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="h-20 grid grid-cols-[auto_1fr_auto] items-center gap-4">

              {/* Left: Mobile Menu Trigger (Mobile) & Logo */}
              <div className="flex items-center gap-4">
                <button
                  className="lg:hidden p-2 -ml-2 text-gray-900 hover:text-gray-600 transition-colors"
                  onClick={() => setIsMobileMenuOpen(true)}
                  aria-label="Open menu"
                >
                  <i className="ri-menu-line text-2xl"></i>
                </button>
                <Link
                  href="/"
                  className="flex items-center select-none"
                  aria-label="Go to homepage"
                >
                  <img src={headerLogo} alt={siteName} className="h-14 md:h-16 w-auto object-contain drop-shadow-md" style={{ filter: 'contrast(1.2) brightness(0.95)' }} />
                </Link>
              </div>

              {/* Center: Navigation Links (Desktop) */}
              <div className="hidden lg:flex items-center justify-center space-x-12">
                {[
                  { label: 'Shop', href: '/shop' },
                  { label: 'Categories', href: '/categories' },
                  { label: 'About', href: '/about' },
                  { label: 'Contact', href: '/contact' },
                ].map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="group relative py-2 text-sm uppercase tracking-widest font-medium text-gray-900 transition-colors hover:text-gray-600"
                  >
                    {link.label}
                    <span className="absolute inset-x-0 bottom-0 h-px scale-x-0 bg-gray-900 transition-transform duration-300 ease-out group-hover:scale-x-100" />
                  </Link>
                ))}
              </div>

              {/* Right: Icons */}
              <div className="flex items-center justify-end space-x-2 sm:space-x-4">
                <button
                  className="p-2 text-gray-900 hover:text-gray-600 transition-transform hover:scale-105"
                  onClick={() => setIsSearchOpen(true)}
                  aria-label="Search"
                >
                  <i className="ri-search-line text-xl"></i>
                </button>

                <Link
                  href="/wishlist"
                  className="p-2 text-gray-900 hover:text-gray-600 transition-transform hover:scale-105 relative hidden sm:block"
                  aria-label="Wishlist"
                >
                  <i className="ri-heart-line text-xl"></i>
                  {wishlistCount > 0 && (
                    <span className="absolute top-1 right-0 flex h-4 w-4 items-center justify-center rounded-full bg-black text-[10px] font-bold text-white">
                      {wishlistCount}
                    </span>
                  )}
                </Link>

                {user ? (
                  <Link
                    href="/account"
                    className="p-2 text-gray-900 hover:text-gray-600 transition-transform hover:scale-105 hidden sm:block"
                    aria-label="Account"
                  >
                    <i className="ri-user-line text-xl"></i>
                  </Link>
                ) : (
                  <Link
                    href="/auth/login"
                    className="p-2 text-gray-900 hover:text-gray-600 transition-transform hover:scale-105 hidden sm:block"
                    aria-label="Login"
                  >
                    <i className="ri-user-line text-xl"></i>
                  </Link>
                )}

                <div className="relative">
                  <button
                    className="p-2 text-gray-900 hover:text-gray-600 transition-transform hover:scale-105"
                    onClick={() => setIsCartOpen(!isCartOpen)}
                    aria-label="Cart"
                  >
                    <i className="ri-shopping-bag-line text-xl"></i>
                    {cartCount > 0 && (
                      <span className="absolute top-1 right-0 flex h-4 w-4 items-center justify-center rounded-full bg-black text-[10px] font-bold text-white">
                        {cartCount}
                      </span>
                    )}
                  </button>
                  <MiniCart isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
                </div>
              </div>

            </div>
          </div>
        </nav>
      </header>

      {isSearchOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center opacity-0 animate-fade-in" style={{ animationFillMode: 'forwards' }}>
          {/* Blurred Dark Backdrop */}
          <div
            className="absolute inset-0 bg-stone-950/90 backdrop-blur-xl"
            onClick={() => setIsSearchOpen(false)}
            aria-hidden="true"
          />

          {/* Search Content */}
          <div className="relative w-full max-w-4xl mx-4 transform translate-y-8 animate-fade-in-up" style={{ animationDelay: '100ms', animationFillMode: 'forwards' }}>
            <button
              onClick={() => setIsSearchOpen(false)}
              className="absolute -top-20 right-0 w-12 h-12 flex items-center justify-center text-stone-400 hover:text-white hover:rotate-90 transition-all duration-500 group"
              aria-label="Close search"
            >
              <i className="ri-close-line text-4xl"></i>
            </button>

            <form onSubmit={handleSearch} className="relative group">
              <div className="relative flex items-center">
                <i className="ri-search-line text-3xl md:text-4xl text-stone-500 group-focus-within:text-white transition-colors duration-500 absolute left-0"></i>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="What are you looking for?"
                  className="w-full bg-transparent border-none pl-12 md:pl-16 py-4 md:py-6 text-3xl md:text-5xl lg:text-6xl text-white placeholder-stone-700 focus:outline-none focus:ring-0 font-serif tracking-wide transition-all"
                  autoFocus
                />
              </div>

              {/* Elegant Underline Animation */}
              <div className="absolute bottom-0 left-0 w-full h-[1px] bg-stone-800">
                <div className="h-full bg-white w-0 group-focus-within:w-full transition-all duration-700 ease-in-out"></div>
              </div>
            </form>

            <div className="mt-12 opacity-0 animate-fade-in" style={{ animationDelay: '300ms', animationFillMode: 'forwards' }}>
              <p className="text-stone-500 text-sm tracking-[0.2em] uppercase text-center flex items-center justify-center gap-3">
                <span className="w-8 h-px bg-stone-800"></span>
                Press Enter to Explore
                <span className="w-8 h-px bg-stone-800"></span>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Menu Drawer */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[100] lg:hidden">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute top-0 left-0 bottom-0 w-4/5 max-w-xs bg-white shadow-xl flex flex-col animate-in slide-in-from-left duration-300">
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <Link href="/" onClick={() => setIsMobileMenuOpen(false)}>
                <img src={headerLogo} alt={siteName} className="h-12 w-auto object-contain drop-shadow-md" style={{ filter: 'contrast(1.2) brightness(0.95)' }} />
              </Link>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-2 -mr-2 text-gray-500 hover:text-gray-900"
                aria-label="Close menu"
              >
                <i className="ri-close-line text-2xl"></i>
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto p-4 space-y-2">
              {[
                { label: 'Home', href: '/' },
                { label: 'Shop', href: '/shop' },
                { label: 'Categories', href: '/categories' },
                { label: 'About', href: '/about' },
                { label: 'Contact', href: '/contact' },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block px-4 py-3 text-lg font-medium text-gray-700 hover:bg-stone-50 hover:text-stone-700 rounded-lg transition-colors"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
              <div className="h-px bg-gray-100 my-2"></div>
              {[
                { label: 'Track Order', href: '/order-tracking' },
                { label: 'Wishlist', href: '/wishlist' },
                { label: 'My Account', href: '/account' },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block px-4 py-3 text-base font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900 rounded-lg transition-colors"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            <div className="p-4 border-t border-gray-100">
              <p className="text-xs text-gray-500 text-center">
                &copy; {new Date().getFullYear()} {siteName}
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}