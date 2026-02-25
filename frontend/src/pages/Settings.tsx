import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { Settings as SettingsIcon, IndianRupee, Building2, Loader2, CheckCircle, MessageSquare, Lock, Moon, Sun, Bell, BellOff, Globe, PanelLeftClose, RefreshCw, RotateCcw, Palette } from 'lucide-react';
import { settingsApi, feedbackApi, getStoredUser } from '../lib/api';
import { useTheme, type Preferences } from '../lib/ThemeContext';
import { useState } from 'react';

/* -- Settings Form Schema -- */
const settingsSchema = z.object({
  oil_change_price: z.string(),
  brake_service_price: z.string(),
  engine_repair_price: z.string(),
  tire_rotation_price: z.string(),
  full_inspection_price: z.string(),
  business_name: z.string().min(1),
  business_phone: z.string().min(1),
  business_email: z.string().email(),
  business_address: z.string().min(1),
});

type SettingsData = z.infer<typeof settingsSchema>;

/* -- Feedback Form Schema -- */
const feedbackSchema = z.object({
  customerName: z.string().min(2, 'Name is required'),
  email: z.string().email('Valid email required'),
  rating: z.number().min(1).max(5),
  comments: z.string().min(5, 'Please provide some feedback'),
});

type FeedbackData = z.infer<typeof feedbackSchema>;

/* ── Reusable toggle row ── */
function ToggleRow({
  icon: Icon,
  label,
  description,
  checked,
  onChange,
}: {
  icon: any;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
      className="flex items-center justify-between p-4 rounded-xl border border-gray-200 bg-gray-50/50"
    >
      <div className="flex items-center gap-3">
        <Icon className="w-5 h-5 text-blue-500" />
        <div>
          <p className="text-sm font-semibold text-gray-900">{label}</p>
          <p className="text-xs text-gray-500">{description}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors duration-200 ${
          checked ? 'bg-blue-600' : 'bg-gray-300'
        }`}
      >
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm"
          style={{ left: checked ? 22 : 2 }}
        />
      </button>
    </motion.div>
  );
}

export default function Settings() {
  const queryClient = useQueryClient();
  const user = getStoredUser();
  const isManager = user?.role === 'Manager';
  const [tab, setTab] = useState<'preferences' | 'pricing' | 'business' | 'feedback'>('preferences');
  const { prefs, update, reset: resetPrefs } = useTheme();
  const [saved, setSaved] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [selectedRating, setSelectedRating] = useState(0);

  /* -- Settings Data -- */
  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => settingsApi.get().then(r => {
      const map: Record<string, string> = {};
      (r.data as any[]).forEach((s: any) => { map[s.setting_key] = s.setting_value; });
      return map;
    }),
  });

  const settingsForm = useForm<SettingsData>({
    resolver: zodResolver(settingsSchema),
    values: {
      oil_change_price: settings?.oil_change_price || '50',
      brake_service_price: settings?.brake_service_price || '150',
      engine_repair_price: settings?.engine_repair_price || '500',
      tire_rotation_price: settings?.tire_rotation_price || '30',
      full_inspection_price: settings?.full_inspection_price || '100',
      business_name: settings?.business_name || 'Garage Services',
      business_phone: settings?.business_phone || '',
      business_email: settings?.business_email || '',
      business_address: settings?.business_address || '',
    },
  });

  const saveSettings = useMutation({
    mutationFn: (data: SettingsData) => settingsApi.update(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  /* -- Feedback -- */
  const feedbackForm = useForm<FeedbackData>({
    resolver: zodResolver(feedbackSchema),
    defaultValues: { rating: 0 },
  });

  const sendFeedback = useMutation({
    mutationFn: (data: FeedbackData) =>
      feedbackApi.submit({
        customerName: data.customerName,
        email: data.email,
        rating: data.rating,
        comments: data.comments,
      }),
    onSuccess: () => {
      feedbackForm.reset();
      setSelectedRating(0);
      setFeedbackSent(true);
      setTimeout(() => setFeedbackSent(false), 3000);
    },
  });

  const onSettingsSave = (data: SettingsData) => saveSettings.mutate(data);
  const onFeedbackSubmit = (data: FeedbackData) => sendFeedback.mutate({ ...data, rating: selectedRating });

  const priceFields = [
    { key: 'oil_change_price', label: 'Oil Change' },
    { key: 'brake_service_price', label: 'Brake Service' },
    { key: 'engine_repair_price', label: 'Engine Repair' },
    { key: 'tire_rotation_price', label: 'Tire Rotation' },
    { key: 'full_inspection_price', label: 'Full Inspection' },
  ] as const;

  const businessFields = [
    { key: 'business_name', label: 'Business Name', placeholder: 'Garage Services' },
    { key: 'business_phone', label: 'Phone', placeholder: '+91 98765 43210' },
    { key: 'business_email', label: 'Email', placeholder: 'info@garage.com', type: 'email' },
    { key: 'business_address', label: 'Address', placeholder: '123 Main St' },
  ] as const;

  const tabs = [
    { key: 'preferences' as const, label: 'Preferences', icon: Palette },
    { key: 'pricing' as const, label: 'Pricing', icon: IndianRupee },
    { key: 'business' as const, label: 'Business', icon: Building2 },
    { key: 'feedback' as const, label: 'Feedback', icon: MessageSquare },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
          <SettingsIcon className="w-8 h-8 text-blue-600" /> Settings
        </h1>
        <p className="text-gray-500 mt-1">
          {isManager ? 'Manage prices, business info, and feedback' : 'View prices, business info, and submit feedback'}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 bg-gray-100 p-1 rounded-xl w-fit">
        {tabs.map(t => (
          <motion.button key={t.key} onClick={() => setTab(t.key)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
              tab === t.key ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            <t.icon className="w-4 h-4" /> {t.label}
          </motion.button>
        ))}
      </div>

      {/* Preferences Tab */}
      {tab === 'preferences' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8 space-y-6">
          <h2 className="text-lg font-bold text-gray-900">Preferences</h2>

          {/* ── Appearance ── */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Appearance</h3>

            {/* Dark Mode */}
            <ToggleRow
              icon={prefs.darkMode ? Moon : Sun}
              label="Dark Mode"
              description="Switch between light and dark theme"
              checked={prefs.darkMode}
              onChange={v => update('darkMode', v)}
            />

            {/* Compact Sidebar */}
            <ToggleRow
              icon={PanelLeftClose}
              label="Compact Sidebar"
              description="Use a narrower sidebar with icon-only navigation"
              checked={prefs.compactSidebar}
              onChange={v => update('compactSidebar', v)}
            />
          </div>

          {/* ── Notifications ── */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Email Notifications</h3>

            <ToggleRow
              icon={Bell}
              label="Booking Confirmations"
              description="Receive email when a booking is confirmed"
              checked={prefs.emailBookingConfirm}
              onChange={v => update('emailBookingConfirm', v)}
            />
            <ToggleRow
              icon={Bell}
              label="Status Updates"
              description="Get notified when your service status changes"
              checked={prefs.emailStatusUpdates}
              onChange={v => update('emailStatusUpdates', v)}
            />
            <ToggleRow
              icon={prefs.emailPromotions ? Bell : BellOff}
              label="Promotions & Offers"
              description="Receive promotional emails and special offers"
              checked={prefs.emailPromotions}
              onChange={v => update('emailPromotions', v)}
            />
          </div>

          {/* ── General ── */}
          <div className="space-y-4">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">General</h3>

            {/* Language */}
            <div className="flex items-center justify-between p-4 rounded-xl border border-gray-200 bg-gray-50/50">
              <div className="flex items-center gap-3">
                <Globe className="w-5 h-5 text-blue-500" />
                <div>
                  <p className="text-sm font-semibold text-gray-900">Language</p>
                  <p className="text-xs text-gray-500">Choose your preferred language</p>
                </div>
              </div>
              <select
                value={prefs.language}
                onChange={e => update('language', e.target.value as Preferences['language'])}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
              >
                <option value="en">English</option>
                <option value="ta">Tamil</option>
                <option value="hi">Hindi</option>
              </select>
            </div>

            {/* Auto-Refresh */}
            <div className="flex items-center justify-between p-4 rounded-xl border border-gray-200 bg-gray-50/50">
              <div className="flex items-center gap-3">
                <RefreshCw className="w-5 h-5 text-blue-500" />
                <div>
                  <p className="text-sm font-semibold text-gray-900">Auto-Refresh Dashboard</p>
                  <p className="text-xs text-gray-500">Automatically refresh data at an interval</p>
                </div>
              </div>
              <select
                value={prefs.autoRefreshInterval}
                onChange={e => update('autoRefreshInterval', Number(e.target.value))}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none"
              >
                <option value={0}>Off</option>
                <option value={15}>15 seconds</option>
                <option value={30}>30 seconds</option>
                <option value={60}>1 minute</option>
                <option value={300}>5 minutes</option>
              </select>
            </div>
          </div>

          {/* Reset */}
          <div className="pt-2">
            <motion.button
              type="button"
              onClick={resetPrefs}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-300 text-sm font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
            >
              <RotateCcw className="w-4 h-4" /> Reset to Defaults
            </motion.button>
          </div>
        </motion.div>
      )}

      {/* Pricing Tab */}
      {tab === 'pricing' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-900">Service Pricing</h2>
            {!isManager && (
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <Lock className="w-3 h-3" /> Read-only
              </span>
            )}
          </div>
          <form onSubmit={settingsForm.handleSubmit(onSettingsSave)} className="space-y-4">
            {priceFields.map(f => (
              <motion.div key={f.key} className="flex items-center gap-4"
                whileHover={{ scale: 1.01 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }}>
                <label className="w-40 text-sm font-medium text-gray-700">{f.label}</label>
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm font-medium">{'\u20B9'}</span>
                  <input {...settingsForm.register(f.key)} type="number" step="0.01" disabled={!isManager}
                    className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all text-sm disabled:opacity-60 disabled:cursor-not-allowed hover:border-blue-300 hover:shadow-sm" />
                </div>
              </motion.div>
            ))}
            {isManager && (
              <div className="pt-4 flex items-center gap-3">
                <motion.button type="submit" disabled={saveSettings.isPending}
                  whileHover={{ scale: 1.03, boxShadow: '0 8px 25px -5px rgba(37,99,235,0.4)' }}
                  whileTap={{ scale: 0.97 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg shadow-blue-500/30 disabled:opacity-50 flex items-center gap-2">
                  {saveSettings.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Save Prices
                </motion.button>
                {saved && (
                  <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-1 text-sm text-emerald-600 font-medium">
                    <CheckCircle className="w-4 h-4" /> Saved!
                  </motion.span>
                )}
              </div>
            )}
          </form>
        </motion.div>
      )}

      {/* Business Tab */}
      {tab === 'business' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-gray-900">Business Information</h2>
            {!isManager && (
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <Lock className="w-3 h-3" /> Read-only
              </span>
            )}
          </div>
          <form onSubmit={settingsForm.handleSubmit(onSettingsSave)} className="space-y-4">
            {businessFields.map(f => (
              <motion.div key={f.key}
                whileHover={{ scale: 1.01 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }}>
                <label className="block text-sm font-medium text-gray-700 mb-1">{f.label}</label>
                <input {...settingsForm.register(f.key)} type={('type' in f && f.type) || 'text'} disabled={!isManager}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all text-sm disabled:opacity-60 disabled:cursor-not-allowed hover:border-blue-300 hover:shadow-sm"
                  placeholder={f.placeholder} />
              </motion.div>
            ))}
            {isManager && (
              <div className="pt-4 flex items-center gap-3">
                <motion.button type="submit" disabled={saveSettings.isPending}
                  whileHover={{ scale: 1.03, boxShadow: '0 8px 25px -5px rgba(37,99,235,0.4)' }}
                  whileTap={{ scale: 0.97 }}
                  transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                  className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg shadow-blue-500/30 disabled:opacity-50 flex items-center gap-2">
                  {saveSettings.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Save Info
                </motion.button>
                {saved && (
                  <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-1 text-sm text-emerald-600 font-medium">
                    <CheckCircle className="w-4 h-4" /> Saved!
                  </motion.span>
                )}
              </div>
            )}
          </form>
        </motion.div>
      )}

      {/* Feedback Tab */}
      {tab === 'feedback' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <h2 className="text-lg font-bold text-gray-900 mb-6">Customer Feedback</h2>

          {feedbackSent ? (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center py-8">
              <CheckCircle className="w-12 h-12 text-emerald-500 mb-3" />
              <p className="text-lg font-bold text-gray-900">Thank you!</p>
              <p className="text-sm text-gray-500">Your feedback has been submitted.</p>
            </motion.div>
          ) : (
            <form onSubmit={feedbackForm.handleSubmit(onFeedbackSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <motion.div whileHover={{ scale: 1.01 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Your Name *</label>
                  <input {...feedbackForm.register('customerName')}
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all text-sm hover:border-blue-300 hover:shadow-sm"
                    placeholder="John Doe" />
                  {feedbackForm.formState.errors.customerName && (
                    <p className="text-xs text-red-500 mt-1">{feedbackForm.formState.errors.customerName.message}</p>
                  )}
                </motion.div>
                <motion.div whileHover={{ scale: 1.01 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                  <input {...feedbackForm.register('email')} type="email"
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all text-sm hover:border-blue-300 hover:shadow-sm"
                    placeholder="john@example.com" />
                  {feedbackForm.formState.errors.email && (
                    <p className="text-xs text-red-500 mt-1">{feedbackForm.formState.errors.email.message}</p>
                  )}
                </motion.div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Rating *</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map(star => (
                    <motion.button key={star} type="button" onClick={() => setSelectedRating(star)}
                      whileHover={{ scale: 1.2, rotate: 5 }}
                      whileTap={{ scale: 0.9 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 15 }}
                      className={`w-10 h-10 rounded-xl text-lg font-bold transition-all ${
                        star <= selectedRating
                          ? 'bg-amber-400 text-white shadow-md shadow-amber-400/30'
                          : 'bg-gray-100 text-gray-400 hover:bg-amber-100'
                      }`}>
                      {'\u2605'}
                    </motion.button>
                  ))}
                </div>
              </div>

              <motion.div whileHover={{ scale: 1.01 }} transition={{ type: 'spring', stiffness: 400, damping: 25 }}>
                <label className="block text-sm font-medium text-gray-700 mb-1">Comments *</label>
                <textarea {...feedbackForm.register('comments')} rows={4}
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50/50 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all text-sm resize-none hover:border-blue-300 hover:shadow-sm"
                  placeholder="Share your experience..." />
                {feedbackForm.formState.errors.comments && (
                  <p className="text-xs text-red-500 mt-1">{feedbackForm.formState.errors.comments.message}</p>
                )}
              </motion.div>

              <motion.button type="submit" disabled={sendFeedback.isPending || selectedRating === 0}
                whileHover={{ scale: 1.03, boxShadow: '0 8px 25px -5px rgba(37,99,235,0.4)' }}
                whileTap={{ scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg shadow-blue-500/30 disabled:opacity-50 flex items-center gap-2">
                {sendFeedback.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Submit Feedback
              </motion.button>
            </form>
          )}
        </motion.div>
      )}
    </div>
  );
}
