require('dotenv').config();
const express = require('express');
const { createClient } = require('@supabase/supabase-js');



const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const app = express();
app.use(express.json());

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

app.get('/api/companies/:company_id/alerts/low-stock', async (req, res) => {
  const { company_id } = req.params;

  const recentDays = Number(req.query.recent_days ?? 30);
  const standardThreshold = Number(req.query.standard_threshold ?? 20);
  const bundleThreshold = Number(req.query.bundle_threshold ?? 10);

  if (!isUuid(company_id)) {
    return res.status(400).json({
      error: 'Invalid company_id. Expected UUID.'
    });
  }

  if (!Number.isInteger(recentDays) || recentDays <= 0) {
    return res.status(400).json({
      error: 'recent_days must be a positive integer.'
    });
  }

  if (Number.isNaN(standardThreshold) || standardThreshold < 0) {
    return res.status(400).json({
      error: 'standard_threshold must be a non-negative number.'
    });
  }

  if (Number.isNaN(bundleThreshold) || bundleThreshold < 0) {
    return res.status(400).json({
      error: 'bundle_threshold must be a non-negative number.'
    });
  }

  try {
    // Return 404 if company doesn't exist
    const { data: company, error: companyError } = await supabase
      .from('company')
      .select('id')
      .eq('id', company_id)
      .maybeSingle();

    if (companyError) {
      console.error('Company lookup failed:', companyError);
      return res.status(500).json({ error: 'Failed to validate company.' });
    }

    if (!company) {
      return res.status(404).json({ error: 'Company not found.' });
    }

    const { data, error } = await supabase.rpc('get_low_stock_alerts', {
      p_company_id: company_id,
      p_recent_sales_days: recentDays,
      p_standard_threshold: standardThreshold,
      p_bundle_threshold: bundleThreshold
    });

    if (error) {
      console.error('RPC error:', error);
      return res.status(500).json({ error: 'Failed to fetch low-stock alerts.' });
    }

    const alerts = (data || []).map((row) => ({
      product_id: row.product_id,
      product_name: row.product_name,
      sku: row.sku,
      warehouse_id: row.warehouse_id,
      warehouse_name: row.warehouse_name,
      current_stock: Number(row.current_stock),
      threshold: Number(row.threshold),
      days_until_stockout: row.days_until_stockout,
      supplier: row.supplier_id
        ? {
            id: row.supplier_id,
            name: row.supplier_name,
            contact_email: row.supplier_contact_email
          }
        : null
    }));

    return res.status(200).json({
      alerts,
      total_alerts: alerts.length
    });
  } catch (err) {
    console.error('Unexpected error:', err);
    return res.status(500).json({
      error: 'Unexpected server error.'
    });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});