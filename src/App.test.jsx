import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from './App';

const headers = [
  'FACTORY',
  'STYLE#',
  'DESC',
  'FABRIC DESC',
  'O QTY',
  'REFERENCE',
  'INSPECTION DATE',
  'History',
  'DATE',
  'Remarks',
];

const mockValues = (overrides = {}) => [
  [
    overrides.factory ?? 'Factory A',
    overrides.style ?? 'ST-1',
    overrides.desc ?? 'Sample Desc',
    overrides.fabricDesc ?? 'Cotton',
    overrides.qty ?? '1000',
    overrides.reference ?? 'REF-1',
    overrides.inspectionDate ?? '2025-12-01',
    overrides.history ?? '2025-11-20',
    overrides.date ?? '2025-12-15',
    overrides.remarks ?? 'Initial remarks',
  ],
];

const mockFetchResponse = (values) => ({
  json: () =>
    Promise.resolve({
      values: [headers, ...values],
    }),
});

describe('Factory Production Tracker App', () => {
  beforeEach(() => {
    vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(mockFetchResponse(mockValues()))
      .mockResolvedValueOnce(mockFetchResponse(mockValues({ style: 'ST-2', reference: 'REF-2' })));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows loading then renders data', async () => {
    render(<App />);
    expect(screen.getByText(/Loading factory data/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Factory Production Tracker/i)).toBeInTheDocument();
    });

    expect(screen.getAllByText('Factory A')[0]).toBeInTheDocument();
  });

  it('displays record count summary', async () => {
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/Showing/i)).toBeInTheDocument();
    });

    expect(screen.getByText(/records from/i)).toHaveTextContent('Showing 2 records from 1 factories');
  });
});

