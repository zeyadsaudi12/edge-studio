/**
 * EDGE Studio - Admin Dashboard Management Logic
 * إدارة الطلبات، الحالات، الدفع، رفع المشاريع، تعديل الأسعار، والإحصائيات
 * مربوطة بقاعدة بيانات MongoDB ومحمية بنظام التوثيق الأمني
 */

document.addEventListener('DOMContentLoaded', () => {

  // التحقق من صلاحية جلسة الأدمن
  const adminToken = localStorage.getItem('edge_admin_token') || sessionStorage.getItem('edge_admin_token');
  const adminUser = JSON.parse(localStorage.getItem('edge_admin_user') || sessionStorage.getItem('edge_admin_user') || '{}');

  if (!adminToken) {
    window.location.replace('login.html');
    return;
  }

  // عرض اسم الأدمن المسجل
  const sidebarAdminName = document.getElementById('sidebar-admin-name');
  if (sidebarAdminName && adminUser.name) {
    sidebarAdminName.textContent = adminUser.name;
  }

  // وظيفة تسجيل الخروج
  function handleLogout() {
    if (confirm('هل ترغب بالتأكيد في تسجيل الخروج من لوحة الإدارة؟')) {
      localStorage.removeItem('edge_admin_token');
      localStorage.removeItem('edge_admin_user');
      sessionStorage.removeItem('edge_admin_token');
      sessionStorage.removeItem('edge_admin_user');
      window.location.replace('login.html');
    }
  }

  document.getElementById('btn-topbar-logout')?.addEventListener('click', handleLogout);
  document.getElementById('btn-sidebar-logout')?.addEventListener('click', handleLogout);

  // التحقق من حالة اتصال خادم وقاعدة بيانات MongoDB
  async function checkBackendStatus() {
    const badge = document.getElementById('db-status-badge');
    if (!badge) return;

    try {
      const res = await fetch('/api/status');
      const data = await res.json();
      if (data.databaseConnected) {
        badge.className = 'badge-status completed';
        badge.innerHTML = '<i class="fa-solid fa-database"></i> MongoDB متصل ✅';
      } else {
        badge.className = 'badge-status in_progress';
        badge.innerHTML = '<i class="fa-solid fa-server"></i> وضع التخزين التلقائي';
      }
    } catch (e) {
      badge.className = 'badge-status pending';
      badge.innerHTML = '<i class="fa-solid fa-hard-drive"></i> تخزين محلي (Offline)';
    }
  }

  checkBackendStatus();

  // نافذة تغيير كلمة المرور للمسؤول
  const passModal = document.getElementById('password-modal');
  const btnOpenPassModal = document.getElementById('btn-open-password-modal');
  const passCloseBtn = document.getElementById('password-modal-close-btn');
  const passCancelBtn = document.getElementById('pass-cancel-btn');
  const changePassForm = document.getElementById('change-password-form');

  btnOpenPassModal?.addEventListener('click', () => passModal?.classList.add('active'));
  passCloseBtn?.addEventListener('click', () => passModal?.classList.remove('active'));
  passCancelBtn?.addEventListener('click', () => passModal?.classList.remove('active'));
  passModal?.addEventListener('click', (e) => {
    if (e.target === passModal) passModal.classList.remove('active');
  });

  changePassForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const curPass = document.getElementById('cur-pass').value;
    const newPass = document.getElementById('new-pass').value;
    const confirmPass = document.getElementById('confirm-pass').value;

    if (newPass !== confirmPass) {
      alert('كلمة المرور الجديدة وتأكيدها غير متطابقين!');
      return;
    }

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + adminToken
        },
        body: JSON.stringify({ currentPassword: curPass, newPassword: newPass })
      });
      const data = await res.json();
      if (data.success) {
        alert('تم تغيير كلمة المرور بنجاح!');
        changePassForm.reset();
        passModal.classList.remove('active');
      } else {
        alert(data.message || 'فشل تغيير كلمة المرور، تأكد من كلمة المرور الحالية.');
      }
    } catch (err) {
      alert('تعذر الاتصال بالخادم.');
    }
  });

  /* ==========================================================================
     1. تصفير وإفراغ سجل الطلبات (Orders Initialization - Zero State)
     ========================================================================== */
  function initializeOrdersEmpty() {
    const existing = localStorage.getItem('edge_orders');
    if (!existing || existing.includes('ORD-1092') || existing.includes('ORD-1088')) {
      localStorage.setItem('edge_orders', JSON.stringify([]));
    }
  }

  initializeOrdersEmpty();

  /* ==========================================================================
     2. أدوات التنقل بين الأقسام (View Navigation)
     ========================================================================== */
  const navLinks = document.querySelectorAll('.sidebar-link');
  const viewSections = document.querySelectorAll('.view-section');
  const currentViewTitle = document.getElementById('current-view-title');

  let currentPackageFilter = 'all';

  function switchView(targetViewId, title, extraParams = {}) {
    navLinks.forEach(link => {
      const linkView = link.getAttribute('data-view');
      const linkPkgFilter = link.getAttribute('data-pkg-filter');

      if (linkView === targetViewId) {
        if (targetViewId === 'view-packages' && extraParams.pkgFilter) {
          if (linkPkgFilter === extraParams.pkgFilter) {
            link.classList.add('active');
          } else {
            link.classList.remove('active');
          }
        } else if (targetViewId === 'view-packages' && !extraParams.pkgFilter && linkPkgFilter === 'all') {
          link.classList.add('active');
        } else if (targetViewId !== 'view-packages') {
          link.classList.add('active');
        } else {
          link.classList.remove('active');
        }
      } else {
        link.classList.remove('active');
      }
    });

    viewSections.forEach(sec => {
      if (sec.id === targetViewId) {
        sec.classList.add('active');
      } else {
        sec.classList.remove('active');
      }
    });

    if (currentViewTitle && title) {
      currentViewTitle.textContent = title;
    }

    // تحديث المحتويات عند الانتقال
    if (targetViewId === 'view-overview' || targetViewId === 'view-orders') {
      renderOrdersTable();
      updateStatistics();
    } else if (targetViewId === 'view-projects') {
      renderAdminProjects();
    } else if (targetViewId === 'view-packages') {
      if (extraParams.pkgFilter) {
        currentPackageFilter = extraParams.pkgFilter;
      }
      syncPkgFilterButtons();
      loadAndRenderPackages();
    }
  }

  navLinks.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const target = link.getAttribute('data-view');
      const title = link.getAttribute('data-title') || link.textContent.trim();
      const pkgFilter = link.getAttribute('data-pkg-filter');
      switchView(target, title, { pkgFilter });
    });
  });

  /* ==========================================================================
     3. حساب وتحديث الإحصائيات الشاملة (Statistics Calculation)
     ========================================================================== */
  function updateStatistics() {
    const orders = JSON.parse(localStorage.getItem('edge_orders') || '[]');

    const totalCount = orders.length;
    const pendingCount = orders.filter(o => o.status === 'pending').length;
    const progressCount = orders.filter(o => o.status === 'in_progress').length;
    const completedCount = orders.filter(o => o.status === 'completed').length;
    const cancelledCount = orders.filter(o => o.status === 'cancelled').length;

    // حساب الأرباح والمبالغ المحصلة
    let totalRevenue = 0;
    orders.forEach(o => {
      const p = parseFloat(o.price) || 0;
      if (o.status === 'completed' || o.paymentStatus === 'fully_paid') {
        totalRevenue += p;
      } else if (o.paymentStatus === 'deposit_paid') {
        totalRevenue += (p * 0.5); // نصف المبلغ كعربون
      }
    });

    // تحديث الأرقام بالواجهة
    document.getElementById('stat-total-orders').textContent = totalCount;
    document.getElementById('stat-pending-orders').textContent = pendingCount;
    document.getElementById('stat-progress-orders').textContent = progressCount;
    document.getElementById('stat-completed-orders').textContent = completedCount;
    document.getElementById('stat-cancelled-orders').textContent = cancelledCount;
    document.getElementById('stat-total-revenue').textContent = totalRevenue.toLocaleString('ar-EG') + ' ج.م';

    // تحديث الشارات في القائمة الجانبية
    const sidebarBadgeOrders = document.getElementById('sidebar-orders-badge');
    if (sidebarBadgeOrders) {
      sidebarBadgeOrders.textContent = pendingCount > 0 ? pendingCount + ' جديد' : totalCount;
    }

    // تحديث التوزيع حسب الأقسام
    const socialOrders = orders.filter(o => o.category === 'social').length;
    const printOrders = orders.filter(o => o.category === 'print').length;
    const brandOrders = orders.filter(o => o.category === 'branding').length;

    document.getElementById('ratio-social').textContent = `${socialOrders} طلب (${Math.round((socialOrders/totalCount||0)*100)}%)`;
    document.getElementById('ratio-print').textContent = `${printOrders} طلب (${Math.round((printOrders/totalCount||0)*100)}%)`;
    document.getElementById('ratio-brand').textContent = `${brandOrders} طلب (${Math.round((brandOrders/totalCount||0)*100)}%)`;
  }

  /* ==========================================================================
     4. إدارة جدول الطلبات والفلترة (Orders Table Management)
     ========================================================================== */
  const ordersTableBody = document.getElementById('orders-table-body');
  const searchInput = document.getElementById('orders-search-input');
  const filterStatusSelect = document.getElementById('filter-status-select');
  const filterPaymentSelect = document.getElementById('filter-payment-select');

  function renderOrdersTable() {
    if (!ordersTableBody) return;

    const orders = JSON.parse(localStorage.getItem('edge_orders') || '[]');
    const query = (searchInput?.value || '').toLowerCase().trim();
    const statusFilter = filterStatusSelect?.value || 'all';
    const payFilter = filterPaymentSelect?.value || 'all';

    ordersTableBody.innerHTML = '';

    const filtered = orders.filter(order => {
      // فلتر الحالة
      if (statusFilter !== 'all' && order.status !== statusFilter) return false;
      // فلتر الدفع
      if (payFilter !== 'all' && order.paymentStatus !== payFilter) return false;
      // فلتر البحث بالاسم أو الرقم أو رقم الطلب أو الخدمة
      if (query) {
        const matchId = (order.id || '').toLowerCase().includes(query);
        const matchName = (order.clientName || '').toLowerCase().includes(query);
        const matchPhone = (order.clientPhone || '').includes(query);
        const matchBrand = (order.brandName || '').toLowerCase().includes(query);
        const matchService = (order.service || '').toLowerCase().includes(query);
        if (!matchId && !matchName && !matchPhone && !matchBrand && !matchService) return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      ordersTableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center; padding:3rem; color:var(--text-dim);">
            <i class="fa-solid fa-inbox fa-3x" style="margin-bottom:1rem; opacity:0.5; display:block;"></i>
            لا توجد طلبات مطابقة لمعايير البحث أو الفلترة المحددة.
          </td>
        </tr>
      `;
      return;
    }

    filtered.forEach(order => {
      const tr = document.createElement('tr');

      // نصوص الشارات
      const statusLabels = {
        pending: { text: 'قيد المراجعة', class: 'pending', icon: 'fa-regular fa-clock' },
        in_progress: { text: 'قيد التنفيذ', class: 'in_progress', icon: 'fa-solid fa-spinner fa-spin' },
        completed: { text: 'مكتمل ومسلّم', class: 'completed', icon: 'fa-solid fa-check' },
        cancelled: { text: 'ملغي', class: 'cancelled', icon: 'fa-solid fa-xmark' }
      };

      const payLabels = {
        unpaid: { text: 'معلق / غير مدفوع', class: 'unpaid' },
        deposit_paid: { text: 'تم دفع العربون (50%)', class: 'deposit_paid' },
        fully_paid: { text: 'مدفوع بالكامل', class: 'fully_paid' }
      };

      const curStatus = statusLabels[order.status] || statusLabels.pending;
      const curPay = payLabels[order.paymentStatus] || payLabels.unpaid;

      tr.innerHTML = `
        <td>
          <strong style="color:var(--edge-cyan-glow);">${order.id}</strong>
          <div style="font-size:0.75rem; color:var(--text-dim);">${order.dateFormatted || 'مؤخراً'}</div>
        </td>
        <td>
          <div style="font-weight:700;">${order.clientName}</div>
          <div style="font-size:0.8rem; color:var(--text-muted);">${order.brandName || 'براند غير محدد'}</div>
          <div style="font-size:0.8rem; direction:ltr; text-align:right; color:var(--text-dim);">${order.clientPhone}</div>
        </td>
        <td>
          <div style="font-weight:600;">${order.service}</div>
          <span style="font-size:0.75rem; color:var(--text-accent);">${order.categoryName || 'خدمة تصميم'}</span>
        </td>
        <td>
          <strong style="font-family:var(--font-heading); color:#fff;">${order.price} ج.م</strong>
        </td>
        <td>
          <select class="form-select select-table-status" data-order-id="${order.id}" style="padding:0.35rem 0.6rem; font-size:0.8rem; width:auto; border-radius:var(--radius-sm);">
            <option value="pending" ${order.status === 'pending' ? 'selected' : ''}>🟡 قيد المراجعة</option>
            <option value="in_progress" ${order.status === 'in_progress' ? 'selected' : ''}>🔵 قيد التنفيذ</option>
            <option value="completed" ${order.status === 'completed' ? 'selected' : ''}>🟢 مكتمل ومسلّم</option>
            <option value="cancelled" ${order.status === 'cancelled' ? 'selected' : ''}>🔴 ملغي</option>
          </select>
        </td>
        <td>
          <select class="form-select select-table-pay" data-order-id="${order.id}" style="padding:0.35rem 0.6rem; font-size:0.8rem; width:auto; border-radius:var(--radius-sm);">
            <option value="unpaid" ${order.paymentStatus === 'unpaid' ? 'selected' : ''}>❌ غير مدفوع</option>
            <option value="deposit_paid" ${order.paymentStatus === 'deposit_paid' ? 'selected' : ''}>⏳ عربون 50%</option>
            <option value="fully_paid" ${order.paymentStatus === 'fully_paid' ? 'selected' : ''}>✅ مدفوع بالكامل</option>
          </select>
        </td>
        <td>
          <div style="display:flex; gap:0.4rem;">
            <button class="btn btn-outline btn-sm btn-view-order" data-order-id="${order.id}" title="عرض تفاصيل الطلب كاملة">
              <i class="fa-solid fa-eye"></i> التفاصيل
            </button>
            <a href="https://wa.me/2${order.clientPhone?.replace(/\D/g, '')}" target="_blank" class="btn btn-sm btn-success" title="محادثة واتساب سريعة">
              <i class="fa-brands fa-whatsapp"></i>
            </a>
            <button class="btn btn-danger btn-sm btn-delete-order" data-order-id="${order.id}" title="حذف الطلب">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </td>
      `;

      ordersTableBody.appendChild(tr);
    });

    // ربط تغيير حالة الطلب
    document.querySelectorAll('.select-table-status').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const orderId = sel.getAttribute('data-order-id');
        const newStatus = sel.value;
        updateOrderStatus(orderId, newStatus);
      });
    });

    // ربط تغيير حالة الدفع
    document.querySelectorAll('.select-table-pay').forEach(sel => {
      sel.addEventListener('change', (e) => {
        const orderId = sel.getAttribute('data-order-id');
        const newPay = sel.value;
        updateOrderPayment(orderId, newPay);
      });
    });

    // ربط أزرار عرض التفاصيل
    document.querySelectorAll('.btn-view-order').forEach(btn => {
      btn.addEventListener('click', () => {
        const orderId = btn.getAttribute('data-order-id');
        openOrderDetailsModal(orderId);
      });
    });

    // ربط أزرار الحذف
    document.querySelectorAll('.btn-delete-order').forEach(btn => {
      btn.addEventListener('click', () => {
        const orderId = btn.getAttribute('data-order-id');
        if (confirm(`هل أنت متأكد من حذف الطلب رقم ${orderId} نهائياً؟`)) {
          deleteOrder(orderId);
        }
      });
    });
  }

  // أحداث الفلترة والبحث
  searchInput?.addEventListener('input', renderOrdersTable);
  filterStatusSelect?.addEventListener('change', renderOrdersTable);
  filterPaymentSelect?.addEventListener('change', renderOrdersTable);

  // مزامنة الطلبات مباشرة من خادم MongoDB
  async function fetchServerOrders() {
    if (!adminToken) return;
    try {
      const res = await fetch('/api/orders', {
        headers: { 'Authorization': 'Bearer ' + adminToken }
      });
      if (res.status === 401 || res.status === 403) {
        window.location.replace('login.html');
        return;
      }
      const data = await res.json();
      if (data.success && Array.isArray(data.orders)) {
        const formatted = data.orders.map(o => ({
          id: o.orderId || o.id,
          createdAt: o.createdAt,
          dateFormatted: new Date(o.createdAt).toLocaleDateString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
          service: o.service,
          category: o.category,
          categoryName: o.categoryName,
          price: o.price,
          clientName: o.clientName,
          clientPhone: o.clientPhone,
          clientEmail: o.clientEmail,
          brandName: o.brandName,
          colors: o.colors,
          uploadedFiles: o.uploadedFiles,
          details: o.details,
          status: o.status,
          paymentStatus: o.paymentStatus,
          adminNotes: o.adminNotes
        }));
        localStorage.setItem('edge_orders', JSON.stringify(formatted));
        renderOrdersTable();
        updateStatistics();
      }
    } catch (e) {
      // وضع التخزين الذاتي الاحتياطي
    }
  }

  fetchServerOrders();

  // مزامنة المشاريع من خادم MongoDB
  async function fetchServerProjects() {
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      if (data.success && Array.isArray(data.projects) && data.projects.length > 0) {
        const formatted = data.projects.map(p => ({
          id: p.projectId || p._id || p.id,
          title: p.title,
          category: p.category,
          categoryName: p.categoryName,
          client: p.client,
          year: p.year,
          image: p.image,
          description: p.description,
          tags: p.tags,
          features: p.features
        }));
        localStorage.setItem('edge_custom_projects', JSON.stringify(formatted));
        renderAdminProjects();
      }
    } catch (e) {}
  }

  fetchServerProjects();

  async function updateOrderStatus(orderId, newStatus) {
    const orders = JSON.parse(localStorage.getItem('edge_orders') || '[]');
    const target = orders.find(o => o.id === orderId);
    if (target) {
      target.status = newStatus;
      localStorage.setItem('edge_orders', JSON.stringify(orders));
      updateStatistics();
    }

    try {
      await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + adminToken
        },
        body: JSON.stringify({ status: newStatus })
      });
    } catch (e) {}
  }

  async function updateOrderPayment(orderId, newPay) {
    const orders = JSON.parse(localStorage.getItem('edge_orders') || '[]');
    const target = orders.find(o => o.id === orderId);
    if (target) {
      target.paymentStatus = newPay;
      localStorage.setItem('edge_orders', JSON.stringify(orders));
      updateStatistics();
    }

    try {
      await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + adminToken
        },
        body: JSON.stringify({ paymentStatus: newPay })
      });
    } catch (e) {}
  }

  async function deleteOrder(orderId) {
    let orders = JSON.parse(localStorage.getItem('edge_orders') || '[]');
    orders = orders.filter(o => o.id !== orderId);
    localStorage.setItem('edge_orders', JSON.stringify(orders));
    renderOrdersTable();
    updateStatistics();

    try {
      await fetch(`/api/orders/${orderId}`, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + adminToken }
      });
    } catch (e) {}
  }

  // تصفير وإفراغ كافة الطلبات بنقرة واحدة
  const btnClearAllOrders = document.getElementById('btn-clear-all-orders');
  btnClearAllOrders?.addEventListener('click', async () => {
    if (confirm('هل أنت متأكد من تصفير وإفراغ سجل الطلبات بالكامل؟ ستصبح الإحصائيات صفراً.')) {
      localStorage.setItem('edge_orders', JSON.stringify([]));
      renderOrdersTable();
      updateStatistics();

      try {
        await fetch('/api/orders', {
          method: 'DELETE',
          headers: { 'Authorization': 'Bearer ' + adminToken }
        });
      } catch (e) {}

      alert('تم تصفير جميع الطلبات بنجاح. السجل الآن فارغ 100%.');
    }
  });

  // نافذة إضافة طلب يدوي جديد
  const manualOrderModal = document.getElementById('manual-order-modal');
  const btnOpenManualOrder = document.getElementById('btn-open-manual-order');
  const manualModalClose = document.getElementById('manual-modal-close-btn');
  const manualCancelBtn = document.getElementById('m-cancel-btn');
  const manualOrderForm = document.getElementById('manual-order-form');

  function openManualOrderModal() {
    manualOrderModal?.classList.add('active');
  }

  function closeManualOrderModal() {
    manualOrderModal?.classList.remove('active');
  }

  btnOpenManualOrder?.addEventListener('click', openManualOrderModal);
  manualModalClose?.addEventListener('click', closeManualOrderModal);
  manualCancelBtn?.addEventListener('click', closeManualOrderModal);
  manualOrderModal?.addEventListener('click', (e) => {
    if (e.target === manualOrderModal) closeManualOrderModal();
  });

  manualOrderForm?.addEventListener('submit', (e) => {
    e.preventDefault();

    const name = document.getElementById('m-client-name').value.trim();
    const phone = document.getElementById('m-client-phone').value.trim();
    const brand = document.getElementById('m-brand-name').value.trim() || 'غير محدد';
    const category = document.getElementById('m-category').value;
    const serviceName = document.getElementById('m-service-name').value.trim();
    const price = parseFloat(document.getElementById('m-price').value) || 0;
    const status = document.getElementById('m-status').value;
    const payment = document.getElementById('m-payment').value;
    const notes = document.getElementById('m-notes').value.trim() || 'طلب مسجل يدوياً عبر لوحة الإدارة';

    const catNames = {
      social: 'سوشيال ميديا',
      print: 'مطبوعات وتغليف',
      branding: 'هوية بصرية'
    };

    const newOrder = {
      id: 'ORD-' + Math.floor(1000 + Math.random() * 9000),
      createdAt: new Date().toISOString(),
      dateFormatted: 'اليوم، ' + new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
      service: serviceName,
      category: category,
      categoryName: catNames[category] || 'خدمة تصميم',
      price: price,
      clientName: name,
      clientPhone: phone,
      clientEmail: '',
      brandName: brand,
      colors: { primary: '#0A58CA', secondary: '#0056F6', accent: '#22D3EE' },
      uploadedFiles: [],
      details: {
        'ملاحظات ومواصفات الاتفاق': notes
      },
      status: status,
      paymentStatus: payment
    };

    const orders = JSON.parse(localStorage.getItem('edge_orders') || '[]');
    orders.unshift(newOrder);
    localStorage.setItem('edge_orders', JSON.stringify(orders));

    // إرسال الطلب إلى قاعدة بيانات MongoDB
    try {
      fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + adminToken
        },
        body: JSON.stringify(newOrder)
      });
    } catch (e) {}

    closeManualOrderModal();
    manualOrderForm.reset();
    renderOrdersTable();
    updateStatistics();
    alert(`تم تسجيل الطلب رقم ${newOrder.id} بنجاح!`);
  });

  /* ==========================================================================
     5. نافذة تفاصيل الطلب المنبثقة (Order Details Modal)
     ========================================================================== */
  const orderModal = document.getElementById('order-detail-modal');
  const orderModalBody = document.getElementById('order-modal-body');
  const orderModalClose = document.getElementById('order-modal-close-btn');

  function openOrderDetailsModal(orderId) {
    const orders = JSON.parse(localStorage.getItem('edge_orders') || '[]');
    const order = orders.find(o => o.id === orderId);
    if (!order || !orderModal || !orderModalBody) return;

    let detailsListHtml = '';
    if (order.details) {
      for (const [k, v] of Object.entries(order.details)) {
        detailsListHtml += `
          <div style="display:flex; justify-content:space-between; padding:0.6rem 0; border-bottom:1px dashed var(--border-subtle);">
            <strong style="color:var(--text-muted); font-size:0.9rem;">${k}:</strong>
            <span style="max-width:65%; text-align:left; color:#fff; font-size:0.92rem;">${v}</span>
          </div>
        `;
      }
    }

    const filesStr = order.uploadedFiles && order.uploadedFiles.length > 0
      ? order.uploadedFiles.map(f => `<span class="badge-status in_progress" style="margin-left:5px;"><i class="fa-regular fa-file"></i> ${f}</span>`).join('')
      : '<span style="color:var(--text-dim);">لا توجد ملفات مرفوعة</span>';

    orderModalBody.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.5rem; flex-wrap:wrap; gap:1rem;">
        <div>
          <span style="font-size:0.85rem; color:var(--text-dim);">رقم المعاملة:</span>
          <h2 style="font-size:1.6rem; color:var(--edge-cyan-glow);">${order.id}</h2>
          <span style="font-size:0.8rem; color:var(--text-muted);">${order.dateFormatted || ''}</span>
        </div>
        <div style="display:flex; gap:0.8rem; align-items:center;">
          <button type="button" class="btn btn-outline" onclick="window.print()" title="طباعة فاتورة رسمية للطلب">
            <i class="fa-solid fa-print"></i> طباعة الفاتورة
          </button>
          <a href="https://wa.me/2${order.clientPhone?.replace(/\D/g, '')}" target="_blank" class="btn btn-success">
            <i class="fa-brands fa-whatsapp"></i> فتح واتساب العميل
          </a>
        </div>
      </div>

      <div class="form-grid-2" style="background:rgba(4,9,20,0.5); border:1px solid var(--border-subtle); border-radius:12px; padding:1.2rem; margin-bottom:1.5rem;">
        <div>
          <span style="color:var(--text-dim); font-size:0.8rem;">بيانات العميل:</span>
          <h4 style="margin:0.2rem 0; font-size:1.15rem;">${order.clientName}</h4>
          <p style="color:var(--text-muted); font-size:0.9rem; margin:0;"><i class="fa-solid fa-building"></i> ${order.brandName || 'براند غير محدد'}</p>
          <p style="color:var(--text-muted); font-size:0.9rem; margin:0;"><i class="fa-solid fa-phone"></i> ${order.clientPhone}</p>
          ${order.clientEmail ? `<p style="color:var(--text-muted); font-size:0.9rem; margin:0;"><i class="fa-solid fa-envelope"></i> ${order.clientEmail}</p>` : ''}
        </div>
        <div>
          <span style="color:var(--text-dim); font-size:0.8rem;">الخدمة والتكلفة:</span>
          <h4 style="margin:0.2rem 0; font-size:1.15rem; color:var(--edge-cyan-glow);">${order.service}</h4>
          <p style="color:#fff; font-size:1.1rem; font-family:var(--font-heading); margin:0.3rem 0;">السعر: <strong>${order.price} ج.م</strong></p>
          <div style="margin-top:0.6rem;">
            <span style="font-size:0.8rem; color:var(--text-dim);">ألوان الهوية المطلوبة:</span>
            <div style="display:flex; align-items:center; gap:8px; margin-top:4px;">
              <span style="display:inline-block; width:22px; height:22px; border-radius:50%; background:${order.colors?.primary}; border:1px solid #fff;" title="أساسي: ${order.colors?.primary}"></span>
              <span style="display:inline-block; width:22px; height:22px; border-radius:50%; background:${order.colors?.secondary}; border:1px solid #fff;" title="ثانوي: ${order.colors?.secondary}"></span>
              <span style="display:inline-block; width:22px; height:22px; border-radius:50%; background:${order.colors?.accent}; border:1px solid #fff;" title="إضاءة: ${order.colors?.accent}"></span>
            </div>
          </div>
        </div>
      </div>

      <div style="margin-bottom:1.5rem;">
        <h4 style="font-size:1rem; margin-bottom:0.8rem; color:var(--text-accent);">مواصفات وتفاصيل الطلب:</h4>
        <div style="background:rgba(4,9,20,0.5); border:1px solid var(--border-subtle); border-radius:12px; padding:1.2rem;">
          ${detailsListHtml}
        </div>
      </div>

      <div style="margin-bottom:1.5rem;">
        <h4 style="font-size:1rem; margin-bottom:0.6rem; color:var(--text-accent);">المرفقات والملفات:</h4>
        <div>${filesStr}</div>
      </div>
    `;

    orderModal.classList.add('active');
  }

  function closeOrderModal() {
    orderModal?.classList.remove('active');
  }

  orderModalClose?.addEventListener('click', closeOrderModal);
  orderModal?.addEventListener('click', (e) => {
    if (e.target === orderModal) closeOrderModal();
  });

  /* ==========================================================================
     6. رفع وإضافة مشاريع جديدة للمعرض (Add New Projects)
     ========================================================================== */
  const addProjectForm = document.getElementById('add-project-form');
  const adminProjectsContainer = document.getElementById('admin-projects-grid');
  const projectImgInput = document.getElementById('proj-img-file');
  const uploadProgressContainer = document.getElementById('upload-progress-container');
  const uploadProgressBar = document.getElementById('upload-progress-bar');
  const uploadProgressPercent = document.getElementById('upload-progress-percent');
  const uploadProgressText = document.getElementById('upload-progress-text');
  const btnSubmitProjects = document.getElementById('btn-submit-projects');

  let selectedRawFiles = [];

  // ضغط وتصغير حجم الصورة عبر Canvas لجعل الرفع فائق السرعة
  function compressImage(file, maxWidth = 1600, quality = 0.8) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;

          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          // تصدير كـ WebP أو JPEG بحجم خفيف جداً
          const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
          resolve(compressedBase64);
        };
        img.onerror = () => resolve(e.target.result);
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // اختيار الصور
  projectImgInput?.addEventListener('change', (e) => {
    selectedRawFiles = Array.from(e.target.files || []);

    if (selectedRawFiles.length === 0) {
      document.getElementById('proj-img-preview-label').textContent = 'اختر صورة أو صوراً متعددة';
      return;
    }

    document.getElementById('proj-img-preview-label').textContent = selectedRawFiles.length === 1 
      ? `تم اختيار: ${selectedRawFiles[0].name}` 
      : `تم اختيار (${selectedRawFiles.length}) صور سيتم نشر كل منها كمشروع منفصل`;
  });

  addProjectForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const title = document.getElementById('proj-title').value.trim();
    const category = document.getElementById('proj-category').value;
    const client = document.getElementById('proj-client').value.trim() || 'عميل استوديو EDGE';
    const year = document.getElementById('proj-year').value.trim() || new Date().getFullYear().toString();
    const tagsStr = document.getElementById('proj-tags').value.trim();
    const imgUrlField = document.getElementById('proj-img-url').value.trim();

    const categoryNames = {
      social: 'سوشيال ميديا',
      print: 'مطبوعات وتغليف',
      branding: 'هوية بصرية'
    };

    const hasFiles = selectedRawFiles.length > 0;
    const totalItems = hasFiles ? selectedRawFiles.length : 1;

    // إظهار شريط التحميل وتعطيل زر النشر أثناء الرفع
    if (uploadProgressContainer) uploadProgressContainer.style.display = 'block';
    if (uploadProgressBar) uploadProgressBar.style.width = '0%';
    if (uploadProgressPercent) uploadProgressPercent.textContent = '0%';
    if (uploadProgressText) uploadProgressText.innerHTML = `<i class="fa-solid fa-spinner fa-spin" style="color:var(--edge-cyan-glow);"></i> جاري تجهيز وضغط الصور... (0 / ${totalItems})`;
    if (btnSubmitProjects) btnSubmitProjects.disabled = true;

    const customProjects = JSON.parse(localStorage.getItem('edge_custom_projects') || '[]');

    for (let i = 0; i < totalItems; i++) {
      let finalImg = 'assets/img/logo-blue-bg.jpg';

      if (hasFiles) {
        if (uploadProgressText) {
          uploadProgressText.innerHTML = `<i class="fa-solid fa-cloud-arrow-up fa-fade" style="color:var(--edge-cyan-glow);"></i> جاري رفع ونشر المشروع (${i + 1} من ${totalItems})...`;
        }
        finalImg = await compressImage(selectedRawFiles[i]);
      } else if (imgUrlField) {
        finalImg = imgUrlField;
      }

      const projectTitle = totalItems > 1 ? `${title} #${i + 1}` : title;

      const newProject = {
        id: 'custom-proj-' + Date.now() + '-' + i,
        title: projectTitle,
        category: category,
        categoryName: categoryNames[category] || 'تصميم إبداعي',
        client: client,
        year: year,
        image: finalImg,
        description: '',
        tags: tagsStr ? tagsStr.split(',').map(t => t.trim()) : [categoryNames[category]],
        features: []
      };

      customProjects.unshift(newProject);

      // إرسال المشروع إلى قاعدة بيانات MongoDB عبر السيرفر
      try {
        await fetch('/api/projects', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + adminToken
          },
          body: JSON.stringify(newProject)
        });
      } catch (err) {}

      // تحديث شريط التقدم بنسبة مئوية
      const percent = Math.round(((i + 1) / totalItems) * 100);
      if (uploadProgressBar) uploadProgressBar.style.width = `${percent}%`;
      if (uploadProgressPercent) uploadProgressPercent.textContent = `${percent}%`;
    }

    localStorage.setItem('edge_custom_projects', JSON.stringify(customProjects));

    if (uploadProgressText) {
      uploadProgressText.innerHTML = `<i class="fa-solid fa-circle-check" style="color:#10B981;"></i> اكتمل الرفع بنجاح 100%!`;
    }

    setTimeout(() => {
      if (uploadProgressContainer) uploadProgressContainer.style.display = 'none';
      if (btnSubmitProjects) btnSubmitProjects.disabled = false;
      addProjectForm.reset();
      selectedRawFiles = [];
      document.getElementById('proj-img-preview-label').textContent = 'اختر صورة أو صوراً متعددة';
      renderAdminProjects();
      alert(totalItems > 1 ? `تم نشر (${totalItems}) مشاريع بنجاح 100% في المعرض!` : 'تم نشر المشروع بنجاح 100% في المعرض!');
    }, 600);
  });

  // تصنيف المشاريع الحالي في لوحة التحكم
  let currentProjectFilter = 'all';

  // ربط أزرار تصنيفات المشاريع
  document.querySelectorAll('.btn-proj-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.btn-proj-filter').forEach(b => {
        b.classList.remove('btn-primary', 'active');
        b.classList.add('btn-outline');
      });
      btn.classList.remove('btn-outline');
      btn.classList.add('btn-primary', 'active');

      currentProjectFilter = btn.getAttribute('data-proj-cat') || 'all';
      renderAdminProjects();
    });
  });

  // جلب كافة المشاريع مع التعديلات المحفوظة
  function getAllAdminProjects() {
    const customProjects = JSON.parse(localStorage.getItem('edge_custom_projects') || '[]');
    const baseProjects = (typeof portfolioData !== 'undefined') ? portfolioData : [];
    
    // دمج المشاريع وتجاوز المعدل منها
    const customIds = new Set(customProjects.map(p => p.id));
    const unoverriddenBase = baseProjects.filter(p => !customIds.has(p.id));
    return [...customProjects, ...unoverriddenBase];
  }

  function renderAdminProjects() {
    if (!adminProjectsContainer) return;

    const allProjects = getAllAdminProjects();

    // تحديث أعداد المشاريع في الأزرار
    const countAll = allProjects.length;
    const countSocial = allProjects.filter(p => p.category === 'social').length;
    const countPrint = allProjects.filter(p => p.category === 'print').length;
    const countBranding = allProjects.filter(p => p.category === 'branding').length;

    if (document.getElementById('count-all-proj')) document.getElementById('count-all-proj').textContent = countAll;
    if (document.getElementById('count-social-proj')) document.getElementById('count-social-proj').textContent = countSocial;
    if (document.getElementById('count-print-proj')) document.getElementById('count-print-proj').textContent = countPrint;
    if (document.getElementById('count-branding-proj')) document.getElementById('count-branding-proj').textContent = countBranding;

    // تصفية المشاريع حسب القسم المختار (سوشيال ميديا، مطبوعات، هوية بصرية)
    const filteredProjects = currentProjectFilter === 'all'
      ? allProjects
      : allProjects.filter(p => p.category === currentProjectFilter);

    adminProjectsContainer.innerHTML = '';

    if (filteredProjects.length === 0) {
      adminProjectsContainer.innerHTML = `
        <div style="grid-column: 1 / -1; text-align:center; padding:3rem; color:var(--text-dim); background:var(--bg-card); border-radius:14px; border:1px solid var(--border-subtle);">
          <i class="fa-solid fa-folder-open fa-3x" style="margin-bottom:1rem; opacity:0.5; display:block;"></i>
          لا توجد مشاريع مضافة في هذا القسم حالياً. يمكنك إضافة مشروع جديد من النموذج أعلاه.
        </div>
      `;
      return;
    }

    filteredProjects.forEach(proj => {
      const card = document.createElement('div');
      card.className = 'admin-project-card';

      card.innerHTML = `
        <img src="${proj.image}" alt="${proj.title}" class="admin-project-img">
        <div class="admin-project-body">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <span class="badge-status in_progress">${proj.categoryName}</span>
            <span style="font-size:0.75rem; color:var(--text-dim);">${proj.year}</span>
          </div>
          <h4 style="font-size:1.1rem; margin:0.3rem 0;">${proj.title}</h4>
          <p style="font-size:0.82rem; color:var(--text-dim); margin-bottom:0.2rem;"><i class="fa-solid fa-user-tie"></i> ${proj.client || 'عميل EDGE'}</p>
          <div style="font-size:0.75rem; color:var(--text-dim); margin-bottom:0.6rem;">${(proj.tags || []).map(t => '#' + t).join(' ')}</div>
          <div class="admin-project-actions">
            <button class="btn btn-outline btn-sm btn-edit-proj" data-id="${proj.id}" style="flex:1;">
              <i class="fa-solid fa-pen-to-square"></i> تعديل
            </button>
            <button class="btn btn-danger btn-sm btn-delete-proj" data-id="${proj.id}" title="حذف المشروع">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
        </div>
      `;

      adminProjectsContainer.appendChild(card);
    });

    // ربط أزرار التعديل
    document.querySelectorAll('.btn-edit-proj').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        openEditProjectModal(id);
      });
    });

    // ربط أزرار الحذف
    document.querySelectorAll('.btn-delete-proj').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        if (confirm('هل تريد بالتأكيد حذف هذا المشروع من معرض الأعمال؟')) {
          try {
            fetch(`/api/projects/${id}`, {
              method: 'DELETE',
              headers: { 'Authorization': 'Bearer ' + adminToken }
            });
          } catch (e) {}

          let customProjects = JSON.parse(localStorage.getItem('edge_custom_projects') || '[]');
          customProjects = customProjects.filter(p => p.id !== id);
          // إرسال التحديث إلى قاعدة بيانات MongoDB
    try {
      fetch(`/api/projects/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + adminToken
        },
        body: JSON.stringify(updatedProject)
      });
    } catch (e) {}

    localStorage.setItem('edge_custom_projects', JSON.stringify(customProjects));
          renderAdminProjects();
        }
      });
    });
  }

  /* نافذة تعديل بيانات المشروع */
  const editProjModal = document.getElementById('edit-project-modal');
  const editProjForm = document.getElementById('edit-project-form');
  const editProjCloseBtn = document.getElementById('edit-proj-modal-close-btn');
  const editProjCancelBtn = document.getElementById('edit-proj-cancel-btn');
  const editProjImgInput = document.getElementById('edit-proj-img-file');
  let editSelectedImgBase64 = '';

  editProjImgInput?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        editSelectedImgBase64 = event.target.result;
        document.getElementById('edit-proj-file-label').textContent = `تم اختيار: ${file.name}`;
      };
      reader.readAsDataURL(file);
    }
  });

  function openEditProjectModal(projId) {
    const allProjects = getAllAdminProjects();
    const proj = allProjects.find(p => p.id === projId);
    if (!proj || !editProjModal) return;

    document.getElementById('edit-proj-id').value = proj.id;
    document.getElementById('edit-proj-title').value = proj.title || '';
    document.getElementById('edit-proj-category').value = proj.category || 'social';
    document.getElementById('edit-proj-client').value = proj.client || '';
    document.getElementById('edit-proj-year').value = proj.year || '';
    document.getElementById('edit-proj-img-url').value = proj.image || '';
    document.getElementById('edit-proj-tags').value = proj.tags ? proj.tags.join(', ') : '';

    editSelectedImgBase64 = '';
    document.getElementById('edit-proj-file-label').textContent = 'اختيار صورة جديدة من جهازك';

    editProjModal.classList.add('active');
  }

  function closeEditProjectModal() {
    editProjModal?.classList.remove('active');
  }

  editProjCloseBtn?.addEventListener('click', closeEditProjectModal);
  editProjCancelBtn?.addEventListener('click', closeEditProjectModal);
  editProjModal?.addEventListener('click', (e) => {
    if (e.target === editProjModal) closeEditProjectModal();
  });

  editProjForm?.addEventListener('submit', (e) => {
    e.preventDefault();

    const id = document.getElementById('edit-proj-id').value;
    const title = document.getElementById('edit-proj-title').value.trim();
    const category = document.getElementById('edit-proj-category').value;
    const client = document.getElementById('edit-proj-client').value.trim() || 'عميل EDGE';
    const year = document.getElementById('edit-proj-year').value.trim() || '2024';
    const imgUrl = document.getElementById('edit-proj-img-url').value.trim();
    const tagsStr = document.getElementById('edit-proj-tags').value.trim();

    const finalImg = editSelectedImgBase64 || imgUrl || 'assets/img/logo-blue-bg.jpg';

    const categoryNames = {
      social: 'سوشيال ميديا',
      print: 'مطبوعات وتغليف',
      branding: 'هوية بصرية'
    };

    const updatedProject = {
      id: id,
      title: title,
      category: category,
      categoryName: categoryNames[category] || 'تصميم إبداعي',
      client: client,
      year: year,
      image: finalImg,
      description: '',
      tags: tagsStr ? tagsStr.split(',').map(t => t.trim()) : [categoryNames[category]],
      features: []
    };

    let customProjects = JSON.parse(localStorage.getItem('edge_custom_projects') || '[]');
    const existingIndex = customProjects.findIndex(p => p.id === id);

    if (existingIndex !== -1) {
      customProjects[existingIndex] = updatedProject;
    } else {
      customProjects.unshift(updatedProject);
    }

    // إرسال التحديث إلى قاعدة بيانات MongoDB
    try {
      fetch(`/api/projects/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + adminToken
        },
        body: JSON.stringify(updatedProject)
      });
    } catch (e) {}

    localStorage.setItem('edge_custom_projects', JSON.stringify(customProjects));
    closeEditProjectModal();
    renderAdminProjects();
    alert('تم حفظ وتحديث بيانات المشروع بنجاح! التعديلات تظهر فوراً في المعرض.');
  });

  /* ==========================================================================
     7. إدارة وباقات الخدمات المخصصة (Packages Management)
     ========================================================================== */
  const packagesGrid = document.getElementById('packages-admin-grid');
  const packageModal = document.getElementById('package-modal');
  const packageModalTitle = document.getElementById('package-modal-title');
  const packageForm = document.getElementById('package-form');
  const btnOpenAddPackageModal = document.getElementById('btn-open-add-package-modal');
  const packageModalCloseBtn = document.getElementById('package-modal-close-btn');
  const packageCancelBtn = document.getElementById('package-cancel-btn');

  let localPackagesCache = [];

  function syncPkgFilterButtons() {
    document.querySelectorAll('.btn-pkg-filter').forEach(btn => {
      const f = btn.getAttribute('data-filter');
      if (f === currentPackageFilter) {
        btn.classList.remove('btn-outline');
        btn.classList.add('btn-primary', 'active');
      } else {
        btn.classList.remove('btn-primary', 'active');
        btn.classList.add('btn-outline');
      }
    });
  }

  // أزرار تصفية الباقات داخل القسم
  document.querySelectorAll('.btn-pkg-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      currentPackageFilter = btn.getAttribute('data-filter') || 'all';
      syncPkgFilterButtons();
      renderPackagesList();
    });
  });

  async function loadAndRenderPackages() {
    try {
      const res = await fetch('/api/packages');
      const data = await res.json();
      if (data.success && Array.isArray(data.packages)) {
        localPackagesCache = data.packages;
        localStorage.setItem('edge_custom_packages', JSON.stringify(localPackagesCache));
      }
    } catch (e) {
      const saved = localStorage.getItem('edge_custom_packages');
      if (saved) {
        try { localPackagesCache = JSON.parse(saved); } catch (err) {}
      }
    }
    renderPackagesList();
    updatePackagesBadges();
  }

  function updatePackagesBadges() {
    const total = localPackagesCache.length;
    const socialCount = localPackagesCache.filter(p => p.category === 'social').length;
    const printCount = localPackagesCache.filter(p => p.category === 'print').length;
    const brandingCount = localPackagesCache.filter(p => p.category === 'branding').length;

    const sidebarBadge = document.getElementById('sidebar-packages-badge');
    if (sidebarBadge) sidebarBadge.textContent = total;

    if (document.getElementById('count-all-pkgs')) document.getElementById('count-all-pkgs').textContent = total;
    if (document.getElementById('count-social-pkgs')) document.getElementById('count-social-pkgs').textContent = socialCount;
    if (document.getElementById('count-print-pkgs')) document.getElementById('count-print-pkgs').textContent = printCount;
    if (document.getElementById('count-branding-pkgs')) document.getElementById('count-branding-pkgs').textContent = brandingCount;
  }

  function renderPackagesList() {
    if (!packagesGrid) return;
    packagesGrid.innerHTML = '';

    const filtered = currentPackageFilter === 'all'
      ? localPackagesCache
      : localPackagesCache.filter(p => p.category === currentPackageFilter);

    if (filtered.length === 0) {
      packagesGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align:center; padding:3.5rem; background:var(--bg-card); border:1px dashed var(--border-subtle); border-radius:14px; color:var(--text-dim);">
          <i class="fa-solid fa-layer-group fa-3x" style="margin-bottom:1rem; opacity:0.4; display:block;"></i>
          لا توجد باقات في هذا القسم حتى الآن.<br>
          انقر على زر <strong>"إضافة باقة جديدة"</strong> لإضافة أول باقة في المتجر.
        </div>
      `;
      return;
    }

    const catIcons = {
      social: 'fa-share-nodes',
      print: 'fa-print',
      branding: 'fa-wand-magic-sparkles'
    };

    filtered.forEach(pkg => {
      const card = document.createElement('div');
      card.className = `package-admin-card ${pkg.popular ? 'popular-card' : ''}`;

      const badgeHtml = pkg.badge ? `<div class="package-badge-pill">${pkg.badge}</div>` : '';
      const iconClass = catIcons[pkg.category] || 'fa-tag';

      const featuresHtml = (pkg.features || []).map(f => `
        <li><i class="fa-solid fa-circle-check"></i> ${f}</li>
      `).join('');

      const pkgId = pkg._id || pkg.id;

      card.innerHTML = `
        ${badgeHtml}
        <div>
          <div class="package-card-header">
            <div class="package-card-category">
              <i class="fa-solid ${iconClass}"></i> ${pkg.categoryName || pkg.category}
            </div>
            <h4 class="package-card-title">${pkg.name}</h4>
            <div class="package-card-price">
              ${pkg.price} ${pkg.currency || 'ج.م'} <span>/ ${pkg.period || 'للتصميم'}</span>
            </div>
          </div>
          <p class="package-card-desc">${pkg.description || ''}</p>
          <ul class="package-card-features">
            ${featuresHtml}
          </ul>
        </div>
        <div class="package-card-actions">
          <button class="btn btn-outline btn-sm btn-edit-package" data-id="${pkgId}" style="flex:1;">
            <i class="fa-solid fa-pen-to-square"></i> تعديل
          </button>
          <button class="btn btn-danger btn-sm btn-delete-package" data-id="${pkgId}" title="حذف الباقة">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      `;

      packagesGrid.appendChild(card);
    });

    // ربط أحداث التعديل والحذف
    document.querySelectorAll('.btn-edit-package').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        openEditPackageModal(id);
      });
    });

    document.querySelectorAll('.btn-delete-package').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        handleDeletePackage(id);
      });
    });
  }

  // فتح وإغلاق نافذة الباقة
  function openAddPackageModal() {
    packageForm.reset();
    document.getElementById('pkg-id').value = '';
    document.getElementById('pkg-currency').value = 'ج.م';
    document.getElementById('pkg-popular').checked = false;
    packageModalTitle.innerHTML = '<i class="fa-solid fa-layer-group" style="color:var(--edge-cyan-glow);"></i> إضافة باقة جديدة';
    packageModal.classList.add('active');
  }

  function openEditPackageModal(id) {
    const pkg = localPackagesCache.find(p => (p._id || p.id) == id);
    if (!pkg) return;

    document.getElementById('pkg-id').value = pkg._id || pkg.id;
    document.getElementById('pkg-name').value = pkg.name || '';
    document.getElementById('pkg-category').value = pkg.category || 'social';
    document.getElementById('pkg-price').value = pkg.price || 0;
    document.getElementById('pkg-currency').value = pkg.currency || 'ج.م';
    document.getElementById('pkg-period').value = pkg.period || '';
    document.getElementById('pkg-badge').value = pkg.badge || '';
    document.getElementById('pkg-popular').checked = !!pkg.popular;
    document.getElementById('pkg-desc').value = pkg.description || '';
    document.getElementById('pkg-features').value = (pkg.features || []).join('\n');

    packageModalTitle.innerHTML = '<i class="fa-solid fa-pen-to-square" style="color:var(--edge-cyan-glow);"></i> تعديل الباقة';
    packageModal.classList.add('active');
  }

  function closePackageModal() {
    packageModal?.classList.remove('active');
  }

  btnOpenAddPackageModal?.addEventListener('click', openAddPackageModal);
  packageModalCloseBtn?.addEventListener('click', closePackageModal);
  packageCancelBtn?.addEventListener('click', closePackageModal);
  packageModal?.addEventListener('click', (e) => {
    if (e.target === packageModal) closePackageModal();
  });

  // حفظ الباقة (إضافة أو تعديل)
  packageForm?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = document.getElementById('pkg-id').value;
    const name = document.getElementById('pkg-name').value.trim();
    const category = document.getElementById('pkg-category').value;
    const price = parseFloat(document.getElementById('pkg-price').value) || 0;
    const currency = document.getElementById('pkg-currency').value.trim() || 'ج.م';
    const period = document.getElementById('pkg-period').value.trim() || 'للتصميم';
    const badge = document.getElementById('pkg-badge').value.trim();
    const popular = document.getElementById('pkg-popular').checked;
    const description = document.getElementById('pkg-desc').value.trim();
    const featuresRaw = document.getElementById('pkg-features').value;
    const features = featuresRaw.split('\n').map(f => f.trim()).filter(Boolean);

    const catNames = {
      social: 'سوشيال ميديا',
      print: 'مطبوعات وتغليف',
      branding: 'هوية بصرية'
    };

    const payload = {
      name,
      category,
      categoryName: catNames[category] || category,
      price,
      currency,
      period,
      badge,
      popular,
      description,
      features
    };

    try {
      if (id) {
        // تعديل
        const res = await fetch(`/api/packages/${id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + adminToken
          },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
          alert('تم تحديث الباقة بنجاح!');
        } else {
          alert(data.message || 'حدث خطأ أثناء تعديل الباقة');
        }
      } else {
        // إضافة جديدة
        const res = await fetch('/api/packages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + adminToken
          },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.success) {
          alert('تمت إضافة الباقة بنجاح!');
        } else {
          alert(data.message || 'حدث خطأ أثناء حفظ الباقة');
        }
      }
    } catch (err) {
      // Fallback محلي إذا كان السيرفر أوفلاين
      if (id) {
        const idx = localPackagesCache.findIndex(p => (p._id || p.id) == id);
        if (idx !== -1) localPackagesCache[idx] = { ...localPackagesCache[idx], ...payload };
      } else {
        payload._id = 'pkg_' + Date.now();
        localPackagesCache.unshift(payload);
      }
      localStorage.setItem('edge_custom_packages', JSON.stringify(localPackagesCache));
      alert('تم حفظ الباقة محلياً!');
    }

    closePackageModal();
    loadAndRenderPackages();
  });

  // حذف الباقة
  async function handleDeletePackage(id) {
    if (!confirm('هل أنت متأكد من رغبتك في حذف هذه الباقة نهائياً؟')) return;

    try {
      const res = await fetch(`/api/packages/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + adminToken }
      });
      const data = await res.json();
      if (data.success) {
        alert('تم حذف الباقة بنجاح.');
      }
    } catch (err) {
      alert('تم الحذف من الواجهة.');
    }

    localPackagesCache = localPackagesCache.filter(p => (p._id || p.id) != id);
    localStorage.setItem('edge_custom_packages', JSON.stringify(localPackagesCache));
    renderPackagesList();
    updatePackagesBadges();
  }

  /* ==========================================================================
     8. تصدير البيانات والتقارير (Export Data)
     ========================================================================== */
  const btnExportOrders = document.getElementById('btn-export-orders-csv');
  btnExportOrders?.addEventListener('click', () => {
    const orders = JSON.parse(localStorage.getItem('edge_orders') || '[]');
    if (orders.length === 0) {
      alert('لا توجد طلبات لتصديرها.');
      return;
    }

    let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
    csvContent += "رقم الطلب,تاريخ الطلب,العميل,الهاتف,البراند,الخدمة,السعر,حالة الطلب,حالة الدفع\n";

    orders.forEach(o => {
      const row = [
        `"${o.id}"`,
        `"${o.dateFormatted || ''}"`,
        `"${o.clientName || ''}"`,
        `"${o.clientPhone || ''}"`,
        `"${o.brandName || ''}"`,
        `"${o.service || ''}"`,
        `"${o.price} ج.م"`,
        `"${o.status}"`,
        `"${o.paymentStatus}"`
      ];
      csvContent += row.join(",") + "\n";
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `EDGE_Orders_Report_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  /* ==========================================================================
     البدء والتشغيل الأولي للوحة
     ========================================================================== */
  renderOrdersTable();
  updateStatistics();
  loadAndRenderPackages();
});

