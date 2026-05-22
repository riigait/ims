import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Home, Mail } from 'lucide-react';

export default function NotFound() {
  const navigate = useNavigate();
  const user = JSON.parse(localStorage.getItem('user') || '{}');

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        <div className="flex justify-center mb-6">
          <div className="bg-red-100 p-6 rounded-full">
            <AlertTriangle size={48} className="text-red-600" />
          </div>
        </div>

        <h1 className="text-4xl font-bold text-gray-900 mb-2">404</h1>

        <h2 className="text-2xl font-semibold text-gray-800 mb-4">
          Something's Wrong
        </h2>

        <p className="text-lg text-gray-600 mb-2">
          I Think We Need to See This To Admin
        </p>

        <p className="text-gray-500 mb-8">
          There's Nothing in Here
        </p>

        <div className="space-y-3">
          <button
            onClick={() => navigate('/dashboard')}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 font-medium transition"
          >
            <Home size={20} />
            Go to Dashboard
          </button>

          <button
            onClick={() => navigate(-1)}
            className="w-full px-6 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 font-medium transition"
          >
            Go Back
          </button>

          {user.role === 'admin' && (
            <a
              href="mailto:noc.voxptech@gmail.com"
              className="w-full flex items-center justify-center gap-2 bg-gray-100 text-gray-700 px-6 py-3 rounded-lg hover:bg-gray-200 font-medium transition"
            >
              <Mail size={20} />
              Report to Admin
            </a>
          )}
        </div>

        <div className="mt-8 p-4 bg-white rounded-lg border border-gray-200">
          <p className="text-xs text-gray-500">
            Error Code: 404<br />
            Page not found or access denied
          </p>
        </div>
      </div>
    </div>
  );
}
