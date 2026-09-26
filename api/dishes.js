const { google } = require('googleapis');

const CATEGORY_NAMES = new Set([
  'mon-man',
  'mon-canh',
  'com-ngoai',
]);

function getConfig() {
  const required = [
    'GOOGLE_SERVICE_ACCOUNT_EMAIL',
    'GOOGLE_PRIVATE_KEY',
    'GOOGLE_SHEET_ID',
    'GOOGLE_SHEET_NAME',
  ];

  const missing = required.filter((key) => !process.env[key]);

  if (missing.length) {
    const error = new Error(
      `Thiếu biến môi trường: ${missing.join(', ')}`
    );
    error.statusCode = 500;
    throw error;
  }

  let privateKey = String(process.env.GOOGLE_PRIVATE_KEY);

  // Nếu private key bị lưu kèm dấu ngoặc kép bên ngoài
  privateKey = privateKey.trim();

  if (
    privateKey.startsWith('"') &&
    privateKey.endsWith('"')
  ) {
    privateKey = privateKey.slice(1, -1);
  }

  // Chuyển ký tự \n thành xuống dòng thật
  privateKey = privateKey.replace(/\\n/g, '\n');

  // Chuẩn hóa xuống dòng
  privateKey = privateKey.replace(/\r\n/g, '\n');

  // Loại bỏ khoảng trắng thừa ở đầu/cuối
  privateKey = privateKey.trim();

  // Kiểm tra cơ bản để báo lỗi rõ ràng hơn
  if (!privateKey.includes('-----BEGIN PRIVATE KEY-----')) {
    const error = new Error(
      'GOOGLE_PRIVATE_KEY không đúng định dạng: thiếu BEGIN PRIVATE KEY.'
    );
    error.statusCode = 500;
    throw error;
  }

  if (!privateKey.includes('-----END PRIVATE KEY-----')) {
    const error = new Error(
      'GOOGLE_PRIVATE_KEY không đúng định dạng: thiếu END PRIVATE KEY.'
    );
    error.statusCode = 500;
    throw error;
  }

  return {
    email: String(
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
    ).trim(),

    privateKey,

    spreadsheetId: String(
      process.env.GOOGLE_SHEET_ID
    ).trim(),

    sheetName: String(
      process.env.GOOGLE_SHEET_NAME
    ).trim(),
  };
}

function getSheets() {
  const config = getConfig();

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: config.email,
      private_key: config.privateKey,
    },
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
    ],
  });

  return {
    sheets: google.sheets({
      version: 'v4',
      auth,
    }),
    config,
  };
}

function cleanName(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

async function readRows(sheets, config) {
  const result = await sheets.spreadsheets.values.get({
    spreadsheetId: config.spreadsheetId,
    range: `${config.sheetName}!A2:D`,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });

  const rows = result.data.values || [];

  return rows
    .map((row, index) => ({
      id: String(row[0] ?? '').trim(),
      category: String(row[1] ?? '').trim(),
      name: cleanName(row[2]),
      createdAt: String(row[3] ?? '').trim(),
      rowNumber: index + 2,
    }))
    .filter(
      (item) =>
        item.id &&
        CATEGORY_NAMES.has(item.category) &&
        item.name
    );
}

async function getSheetId(sheets, config) {
  const result = await sheets.spreadsheets.get({
    spreadsheetId: config.spreadsheetId,
    fields: 'sheets(properties(sheetId,title))',
  });

  const sheet = (result.data.sheets || []).find(
    (item) =>
      item.properties &&
      item.properties.title === config.sheetName
  );

  if (!sheet) {
    const error = new Error(
      `Không tìm thấy sheet: ${config.sheetName}`
    );
    error.statusCode = 500;
    throw error;
  }

  return sheet.properties.sheetId;
}

async function appendDish(
  sheets,
  config,
  { category, name }
) {
  const id = `${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 9)}`;

  const createdAt = new Date().toISOString();

  await sheets.spreadsheets.values.append({
    spreadsheetId: config.spreadsheetId,
    range: `${config.sheetName}!A:D`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    resource: {
      values: [
        [id, category, name, createdAt],
      ],
    },
  });

  return {
    id,
    category,
    name,
    createdAt,
  };
}

async function updateDish(
  sheets,
  config,
  payload
) {
  const rows = await readRows(sheets, config);

  const target = rows.find(
    (row) => row.id === payload.id
  );

  if (!target) {
    const error = new Error(
      'Không tìm thấy món cần sửa.'
    );
    error.statusCode = 404;
    throw error;
  }

  const category =
    payload.category || target.category;

  const name = cleanName(
    payload.name || target.name
  );

  if (
    !CATEGORY_NAMES.has(category) ||
    !name
  ) {
    const error = new Error(
      'Phân loại hoặc tên món không hợp lệ.'
    );
    error.statusCode = 400;
    throw error;
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: config.spreadsheetId,
    range: `${config.sheetName}!A${target.rowNumber}:D${target.rowNumber}`,
    valueInputOption: 'USER_ENTERED',
    resource: {
      values: [
        [
          target.id,
          category,
          name,
          target.createdAt,
        ],
      ],
    },
  });

  return {
    id: target.id,
    category,
    name,
    createdAt: target.createdAt,
  };
}

async function deleteDish(
  sheets,
  config,
  id
) {
  const rows = await readRows(sheets, config);

  const target = rows.find(
    (row) => row.id === id
  );

  if (!target) {
    const error = new Error(
      'Không tìm thấy món cần xóa.'
    );
    error.statusCode = 404;
    throw error;
  }

  const sheetId = await getSheetId(
    sheets,
    config
  );

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: config.spreadsheetId,
    resource: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex:
                target.rowNumber - 1,
              endIndex:
                target.rowNumber,
            },
          },
        },
      ],
    },
  });
}

module.exports = async function handler(
  req,
  res
) {
  res.setHeader(
    'Cache-Control',
    'no-store, max-age=0'
  );

  try {
    const { sheets, config } =
      getSheets();

    // =========================
    // GET - Lấy danh sách món
    // =========================
    if (req.method === 'GET') {
      const rows = await readRows(
        sheets,
        config
      );

      return res.status(200).json({
        ok: true,
        dishes: rows.map(
          ({ rowNumber, ...dish }) =>
            dish
        ),
      });
    }

    // =========================
    // Chỉ cho phép POST
    // =========================
    if (req.method !== 'POST') {
      return res.status(405).json({
        ok: false,
        error:
          'Method không được hỗ trợ.',
      });
    }

    const body =
      typeof req.body === 'string'
        ? JSON.parse(
            req.body || '{}'
          )
        : req.body || {};

    const action = body.action;

    // =========================
    // ADD
    // =========================
    if (action === 'add') {
      const category = String(
        body.category || ''
      ).trim();

      const name = cleanName(
        body.name
      );

      if (
        !CATEGORY_NAMES.has(
          category
        ) ||
        !name ||
        name.length > 120
      ) {
        return res.status(400).json({
          ok: false,
          error:
            'Tên món hoặc phân loại không hợp lệ.',
        });
      }

      const dish =
        await appendDish(
          sheets,
          config,
          {
            category,
            name,
          }
        );

      return res.status(201).json({
        ok: true,
        dish,
      });
    }

    // =========================
    // UPDATE
    // =========================
    if (action === 'update') {
      const dish =
        await updateDish(
          sheets,
          config,
          body
        );

      return res.status(200).json({
        ok: true,
        dish,
      });
    }

    // =========================
    // DELETE
    // =========================
    if (action === 'delete') {
      const id = String(
        body.id || ''
      ).trim();

      if (!id) {
        return res.status(400).json({
          ok: false,
          error:
            'Thiếu id món.',
        });
      }

      await deleteDish(
        sheets,
        config,
        id
      );

      return res.status(200).json({
        ok: true,
      });
    }

    return res.status(400).json({
      ok: false,
      error:
        'Action không hợp lệ.',
    });

  } catch (error) {
    console.error(
      'API ERROR:',
      error
    );

    const status =
      error.statusCode || 500;

    return res.status(status).json({
      ok: false,
      error:
        error.message ||
        'Lỗi máy chủ.',
    });
  }
};
