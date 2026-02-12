'use client';

import type { ImageReport as ImageReportType } from '@/lib/types';

const STATUS_STYLES = {
  found: 'bg-green-100 text-green-800',
  missing: 'bg-red-100 text-red-800',
  unverified: 'bg-yellow-100 text-yellow-800',
};

const METHOD_LABELS: Record<string, string> = {
  'exact-url': 'Exact URL',
  filename: 'Filename',
  'normalized-filename': 'Normalized filename',
  'content-hash': 'Content hash',
  'alt-text': 'Alt text',
};

export default function ImageReport({
  report,
}: {
  report: ImageReportType;
}) {
  if (report.total === 0) {
    return (
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          Image Report
        </h2>
        <p className="text-gray-500 text-sm">
          No images found in the source page content area.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-900 mb-3">
        Image Report
        <span className="ml-2 text-sm font-normal text-gray-500">
          ({report.found}/{report.total} found)
        </span>
      </h2>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left px-4 py-2 font-medium text-gray-600">
                Source Image
              </th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">
                Alt Text
              </th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">
                Status
              </th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">
                Match Method
              </th>
              <th className="text-left px-4 py-2 font-medium text-gray-600">
                Target Match
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {report.details.map((detail, i) => {
              const filename = detail.src.split('/').pop() || detail.src;
              return (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-2 max-w-[200px] truncate" title={detail.src}>
                    <a
                      href={detail.src}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      {filename}
                    </a>
                  </td>
                  <td className="px-4 py-2 max-w-[150px] truncate text-gray-600">
                    {detail.alt || '-'}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[detail.status]}`}
                    >
                      {detail.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-600">
                    {detail.matchMethod
                      ? METHOD_LABELS[detail.matchMethod] || detail.matchMethod
                      : '-'}
                  </td>
                  <td className="px-4 py-2 max-w-[200px] truncate">
                    {detail.targetMatch ? (
                      <a
                        href={detail.targetMatch}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        {detail.targetMatch.split('/').pop()}
                      </a>
                    ) : (
                      '-'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
