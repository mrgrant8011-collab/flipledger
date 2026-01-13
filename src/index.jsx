import React from 'react';
import { ChevronRightIcon, ChartBarIcon, CubeIcon, CashIcon, BankIcon } from '@heroicons/react/solid';

const DashboardMetric = ({ icon, label, value, change, color }) => (
  <div className="bg-gray-800 rounded-xl p-4 flex items-center justify-between shadow-md">
    <div className="flex items-center space-x-3">
      <div className={`p-2 rounded-full ${color} bg-opacity-20`}>
        {icon}
      </div>
      <div>
        <p className="text-gray-400 text-sm">{label}</p>
        <p className="text-white font-bold text-lg">${value}</p>
      </div>
    </div>
    <ChevronRightIcon className="h-6 w-6 text-gray-500" />
  </div>
);

const MobileDashboard = () => {
  const metrics = [
    {
      icon: <ChartBarIcon className="h-6 w-6 text-yellow-500" />,
      label: 'Gross Revenue',
      value: '0.00',
      change: 0,
      color: 'bg-yellow-500'
    },
    {
      icon: <CubeIcon className="h-6 w-6 text-green-500" />,
      label: 'Cost of Goods',
      value: '0.00',
      change: 1,
      color: 'bg-green-500'
    },
    {
      icon: <CashIcon className="h-6 w-6 text-red-500" />,
      label: 'Platform Fees',
      value: '0.00',
      change: -3,
      color: 'bg-red-500'
    },
    {
      icon: <BankIcon className="h-6 w-6 text-purple-500" />,
      label: 'Inventory Value',
      value: '0.00',
      change: 8,
      color: 'bg-purple-500'
    }
  ];

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Top Bar */}
      <div className="bg-gray-800 p-4 flex justify-between items-center">
        <div className="flex items-center space-x-3">
          <div className="bg-yellow-600 p-2 rounded-lg">
            <span className="text-white font-bold">FL</span>
          </div>
          <h1 className="text-xl font-bold">FlipLedger</h1>
        </div>
        <div className="flex items-center space-x-3">
          <span className="text-gray-400">2025</span>
          <button className="text-gray-400">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Net Profit Section */}
      <div className="p-6 text-center bg-gray-900">
        <p className="text-gray-400 mb-2 flex items-center justify-center">
          <span className="h-2 w-2 bg-green-500 rounded-full mr-2"></span>
          NET PROFIT YTD
        </p>
        <h2 className="text-4xl font-bold text-white mb-2">$0.00</h2>
        <p className="text-green-500">↑ 0% • 0 transactions</p>
      </div>

      {/* Metrics Grid */}
      <div className="p-4 grid grid-cols-2 gap-4">
        {metrics.map((metric, index) => (
          <DashboardMetric key={index} {...metric} />
        ))}
      </div>

      {/* Quick Actions */}
      <div className="p-4 space-y-4">
        <button className="w-full bg-yellow-600 text-white py-3 rounded-lg font-semibold">
          + Record Sale
        </button>
        <button className="w-full bg-green-600 text-white py-3 rounded-lg font-semibold">
          + Add Expense
        </button>
      </div>
    </div>
  );
};

export default MobileDashboard;
