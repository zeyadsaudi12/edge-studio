/**
 * EDGE Creative Studio - Main Application Logic
 * إدارة معرض الأعمال، الأسعار، الويزارد التفاعلي للطلبات، ومنتقي الألوان، وربط الواتساب
 */

document.addEventListener('DOMContentLoaded', () => {
  // رقم الواتساب الخاص بالاستوديو لاستقبال الطلبات (يمكن تغييره بسهولة)
  const STUDIO_WHATSAPP_NUMBER = "201556448880"; // صيغة دولية بدون +

  // حالة الطلب الحالية (Order State)
  const orderState = {
    currentStep: 1,
    selectedService: null, // الكائن الخاص بالخدمة أو الباقة
    colors: {
      primary: '#0A58CA',
      secondary: '#0056F6',
      accent: '#22D3EE'
    },
    uploadedFiles: [],
    contact: {
      name: '',
      phone: '',
      email: '',
      brandName: ''
    },
    serviceDetails: {}
  };

  /* ==========================================================================
     1. تهيئة معرض الأعمال (Portfolio Init & Filtering)
     ========================================================================== */
  const portfolioContainer = document.getElementById('portfolio-grid');
  const portfolioTabs = document.querySelectorAll('.portfolio-tabs .tab-btn');

  let cachedPortfolioItems = [];

  // جلب جميع المشاريع (من الـ API أو التخزين المحلي)
  async function fetchServerProjects() {
    try {
      const res = await fetch('/api/projects');
      const data = await res.json();
      if (data.success && Array.isArray(data.projects) && data.projects.length > 0) {
        const formatted = data.projects.map(p => ({
          id: p.projectId || p._id || p.id,
          title: p.title,
          category: p.category,
          categoryName: p.categoryName || 'تصميم إبداعي',
          client: p.client || 'عميل EDGE',
          year: p.year || '',
          image: p.image,
          description: p.description || '',
          tags: p.tags || [],
          features: p.features || [],
          showInHome: p.showInHome !== false
        }));
        cachedPortfolioItems = formatted;
        try {
          localStorage.setItem('edge_custom_projects', JSON.stringify(formatted));
        } catch (e) {}
        return formatted;
      }
    } catch (e) {}

    if (cachedPortfolioItems.length > 0) return cachedPortfolioItems;
    let customProjects = [];
    try {
      customProjects = JSON.parse(localStorage.getItem('edge_custom_projects') || '[]');
    } catch (e) {}
    const baseProjects = (typeof portfolioData !== 'undefined') ? portfolioData : [];
    const customIds = new Set(customProjects.map(p => p.id));
    const unoverriddenBase = baseProjects.filter(p => !customIds.has(p.id));
    return [...customProjects, ...unoverriddenBase];
  }

  function getAllPortfolioItems() {
    if (cachedPortfolioItems.length > 0) return cachedPortfolioItems;
    let customProjects = [];
    try {
      customProjects = JSON.parse(localStorage.getItem('edge_custom_projects') || '[]');
    } catch (e) {}
    const baseProjects = (typeof portfolioData !== 'undefined') ? portfolioData : [];
    const customIds = new Set(customProjects.map(p => p.id));
    const unoverriddenBase = baseProjects.filter(p => !customIds.has(p.id));
    return [...customProjects, ...unoverriddenBase];
  }

  let currentPortfolioCategory = 'all';
  let isShowingAllGallery = false;

  function updateHomeCategoryCounters(allItems) {
    const total = allItems.length;
    const homeCount = allItems.filter(p => p.showInHome !== false).length;
    const cats = ['posts', 'covers', 'frames', 'profiles', 'thum', 'certificates', 'social', 'print', 'branding'];
    const elAll = document.getElementById('home-count-all');
    if (elAll) elAll.textContent = homeCount;
    cats.forEach(c => {
      const el = document.getElementById(`home-count-${c}`);
      if (el) el.textContent = allItems.filter(p => p.category === c).length;
    });
  }

  async function renderPortfolio(category = 'all', forceShowAll = false) {
    if (!portfolioContainer) return;

    currentPortfolioCategory = category;
    portfolioContainer.innerHTML = '';
    const allItems = await fetchServerProjects();
    updateHomeCategoryCounters(allItems);

    const filteredItems = category === 'all'
      ? allItems
      : allItems.filter(item => item.category === category);

    const showingInfo = document.getElementById('portfolio-showing-info');
    const btnViewAll = document.getElementById('btn-view-all-gallery');
    const homeCount = allItems.filter(p => p.showInHome !== false).length;

    if (filteredItems.length === 0) {
      if (showingInfo) showingInfo.textContent = '';
      portfolioContainer.innerHTML = `
        <div style="grid-column: 1 / -1; text-align:center; padding:3.5rem; background:var(--bg-card); border:1px dashed var(--border-subtle); border-radius:16px; color:var(--text-muted);">
          <i class="fa-solid fa-folder-open fa-3x" style="margin-bottom:1rem; opacity:0.4; color:var(--edge-cyan-glow); display:block;"></i>
          لا توجد أعمال معروضة في هذا القسم حالياً. ترقبوا إضافات جديدة قريباً!
        </div>
      `;
      if (btnViewAll) {
        btnViewAll.innerHTML = `<i class="fa-solid fa-star" style="color:#FBBF24;"></i> العودة إلى قسم آخر الأعمال (${homeCount})`;
      }
      return;
    }

    let itemsToDisplay = [];
    const catTitles = {
      all: 'آخر الأعمال',
      posts: 'بوستات (Posts)',
      covers: 'أغلفة (Covers)',
      frames: 'إطارات (Frames)',
      profiles: 'بروفايلات (Profiles)',
      thum: 'صور مصغرة (Thum)',
      certificates: 'شهادات تقدير',
      social: 'سوشيال ميديا',
      print: 'مطبوعات وتغليف',
      branding: 'هويات بصرية'
    };

    if (category !== 'all') {
      // عند اختيار أي تصنيف: عرض كااااامل الأعمال في هذا القسم مباشرة بدون الانتقال لصفحة أخرى
      itemsToDisplay = filteredItems;
      if (showingInfo) {
        showingInfo.innerHTML = `يتم عرض جميع تصاميم <strong>${catTitles[category] || category}</strong> (${itemsToDisplay.length} تصميم)`;
      }
      if (btnViewAll) {
        btnViewAll.style.display = 'inline-flex';
        btnViewAll.innerHTML = `
          <i class="fa-solid fa-star" style="color:#FBBF24;"></i> العودة إلى قسم آخر الأعمال المختارة (${homeCount} تصميم)
          <i class="fa-solid fa-arrow-left" style="margin-right:0.5rem; font-size:0.9rem;"></i>
        `;
      }
    } else {
      // في قسم "آخر الأعمال": عرض المشاريع المحددة للرئيسية فقط (showInHome !== false)
      if (isShowingAllGallery || forceShowAll) {
        isShowingAllGallery = true;
        itemsToDisplay = allItems;
        if (showingInfo) {
          showingInfo.innerHTML = `يتم الآن عرض <strong>كافة أعمال الاستوديو بالكامل من جميع الأقسام</strong> (${itemsToDisplay.length} تصميم)`;
        }
        if (btnViewAll) {
          btnViewAll.style.display = 'inline-flex';
          btnViewAll.innerHTML = `
            <i class="fa-solid fa-star" style="color:#FBBF24;"></i> عرض آخر الأعمال المحددة للرئيسية فقط (${homeCount} تصميم)
            <i class="fa-solid fa-chevron-up" style="margin-right:0.5rem; font-size:0.9rem;"></i>
          `;
        }
      } else {
        const homeItems = allItems.filter(item => item.showInHome !== false);
        itemsToDisplay = homeItems.length > 0 ? homeItems : allItems;
        if (showingInfo) {
          showingInfo.innerHTML = `يتم عرض <strong>آخر الأعمال</strong> المضافة للصفحة الرئيسية (${itemsToDisplay.length} تصميم)`;
        }
        if (btnViewAll) {
          btnViewAll.style.display = 'inline-flex';
          btnViewAll.innerHTML = `
            <i class="fa-solid fa-layer-group"></i> تصفح جميع التصاميم من كافة الأقسام (${allItems.length} تصميم)
            <i class="fa-solid fa-chevron-down" style="margin-right:0.5rem; font-size:0.9rem;"></i>
          `;
        }
      }
    }

    itemsToDisplay.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'portfolio-card';
      card.setAttribute('data-category', item.category);
      card.style.cursor = 'pointer';

      const tagsHtml = item.tags
        ? item.tags.map(tag => `<span class="tag-badge">#${tag}</span>`).join('')
        : '';

      card.innerHTML = `
        <div class="portfolio-thumb-wrap">
          <img src="${item.image}" alt="${item.title}" class="portfolio-thumb" loading="lazy">
          <div class="portfolio-overlay">
            <button class="overlay-btn view-project-btn" data-id="${item.id}">
              <i class="fa-solid fa-expand"></i> معاينة وتفاصيل
            </button>
          </div>
          <div class="mobile-tap-hint">
            <i class="fa-solid fa-magnifying-glass-plus"></i> اضغط للمعاينة
          </div>
        </div>
        <div class="portfolio-body">
          <div class="portfolio-meta">
            <span class="portfolio-cat-tag">${item.categoryName}</span>
            <span class="portfolio-year">${item.year}</span>
          </div>
          <h3 class="portfolio-title">${item.title}</h3>
          ${item.description ? `<p class="portfolio-desc">${item.description}</p>` : ''}
          <div class="portfolio-tags">
            ${tagsHtml}
          </div>
        </div>
      `;

      // فتح المعاينة عند النقر على الكارت كاملاً (مريح جداً للهواتف)
      card.addEventListener('click', () => {
        openPortfolioModal(item.id);
      });

      portfolioContainer.appendChild(card);
    });
  }

  // تبديل التصنيفات
  portfolioTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      portfolioTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const cat = tab.getAttribute('data-filter') || 'all';
      renderPortfolio(cat);
    });
  });

  // زر توسيع / تقليص المعرض في نفس الصفحة بدون الانتقال لصفحة أخرى
  const btnViewAllGallery = document.getElementById('btn-view-all-gallery');
  btnViewAllGallery?.addEventListener('click', () => {
    if (currentPortfolioCategory !== 'all') {
      portfolioTabs.forEach(t => {
        if (t.getAttribute('data-filter') === 'all') t.classList.add('active');
        else t.classList.remove('active');
      });
      isShowingAllGallery = true;
      renderPortfolio('all', true);
    } else {
      isShowingAllGallery = !isShowingAllGallery;
      renderPortfolio('all', isShowingAllGallery);
    }
  });

  /* ==========================================================================
     2. نافذة المعاينة السريعة (Portfolio Modal / Lightbox)
     ========================================================================== */
  const projectModal = document.getElementById('project-modal');
  const modalCloseBtn = document.getElementById('modal-close-btn');
  const modalBody = document.getElementById('modal-dynamic-content');

  function openPortfolioModal(id) {
    const allItems = getAllPortfolioItems();
    const item = allItems.find(p => p.id === id);
    if (!item || !projectModal || !modalBody) return;

    const featuresList = item.features
      ? item.features.map(f => `<li style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.5rem;"><i class="fa-solid fa-circle-check" style="color:var(--edge-cyan-glow);"></i> ${f}</li>`).join('')
      : '';

    modalBody.innerHTML = `
      <div class="modal-img-container">
        <img src="${item.gallery ? item.gallery[0] : item.image}" alt="${item.title}">
      </div>
      <div class="modal-details-body">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.8rem;">
          <span class="section-badge" style="font-size:0.8rem; padding:0.25rem 0.75rem;">${item.categoryName}</span>
          <span style="color:var(--text-dim); font-size:0.85rem;"><i class="fa-regular fa-calendar"></i> سنة التنفيذ: ${item.year}</span>
        </div>
        <h2 style="font-size:1.45rem; margin-bottom:0.4rem; color:#fff;">${item.title}</h2>
        <p style="color:var(--text-accent); font-weight:600; font-size:0.95rem; margin-bottom:1rem;"><i class="fa-solid fa-user-tie"></i> العميل: ${item.client}</p>
        ${item.description ? `<p style="color:var(--text-muted); line-height:1.7; font-size:0.9rem; margin-bottom:1.2rem;">${item.description}</p>` : ''}
        
        <div style="display:flex; gap:0.8rem; flex-wrap:wrap; margin-top:0.5rem;">
          <button class="btn btn-primary btn-sm" onclick="window.requestSpecificCategory('${item.category}', '${item.title}')" style="flex:1;">
            <i class="fa-solid fa-paper-plane"></i> طلب تصميم مشابه
          </button>
          <button class="btn btn-outline btn-sm" id="modal-close-action">
            إغلاق المعاينة
          </button>
        </div>
      </div>
    `;

    projectModal.classList.add('active');
    document.body.style.overflow = 'hidden';

    document.getElementById('modal-close-action')?.addEventListener('click', closePortfolioModal);
  }

  function closePortfolioModal() {
    if (!projectModal) return;
    projectModal.classList.remove('active');
    document.body.style.overflow = '';
  }

  modalCloseBtn?.addEventListener('click', closePortfolioModal);
  projectModal?.addEventListener('click', (e) => {
    if (e.target === projectModal) closePortfolioModal();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closePortfolioModal();
  });

  /* ==========================================================================
     3. تهيئة جدول وباقات الأسعار (Pricing Table Init)
     ========================================================================== */
  const pricingContainer = document.getElementById('pricing-categories-container');
  let publicPackagesList = [];

  // جلب باقات الأسعار المحدثة من API السيرفر ومونجو
  async function fetchPublicPackages() {
    try {
      const res = await fetch('/api/packages');
      const data = await res.json();
      if (data.success && Array.isArray(data.packages)) {
        publicPackagesList = data.packages;
        localStorage.setItem('edge_custom_packages', JSON.stringify(publicPackagesList));
        return publicPackagesList;
      }
    } catch (e) {
      console.warn('API /api/packages offline, using local storage cache.');
    }

    const saved = localStorage.getItem('edge_custom_packages');
    if (saved) {
      try {
        publicPackagesList = JSON.parse(saved);
        return publicPackagesList;
      } catch (err) {}
    }
    return [];
  }

  async function renderPricing() {
    if (!pricingContainer) return;

    pricingContainer.innerHTML = `
      <div style="text-align:center; padding:2.5rem; color:var(--text-dim);">
        <i class="fa-solid fa-spinner fa-spin fa-2x" style="color:var(--edge-cyan-glow); margin-bottom:0.8rem; display:block;"></i>
        جاري تحميل أحدث الباقات والأسعار...
      </div>
    `;

    const allPackages = await fetchPublicPackages();

    const categoryMeta = [
      {
        id: 'social',
        title: 'خدمات السوشيال ميديا',
        subtitle: 'تصاميم احترافية لمنصات إنستغرام، فيسبوك، تيك توك، ولينكد إن تزيد تفاعل حسابك ومبيعاتك',
        icon: 'fa-solid fa-share-nodes'
      },
      {
        id: 'print',
        title: 'خدمات المطبوعات والتغليف',
        subtitle: 'مطبوعات تجارية وتسويقية معدّة بدقة طباعية CMYK ومع خطوط القص لتضمن أعلى جودة في أي مطبعة',
        icon: 'fa-solid fa-print'
      },
      {
        id: 'branding',
        title: 'خدمات الهوية البصرية والعلامات التجارية',
        subtitle: 'بناء أساس قوي ومميز لعلامتك التجارية يميزك عن المنافسين ويبقى في ذاكرة عملائك لسنوات',
        icon: 'fa-solid fa-wand-magic-sparkles'
      }
    ];

    pricingContainer.innerHTML = '';

    if (allPackages.length === 0) {
      pricingContainer.innerHTML = `
        <div style="text-align:center; padding:3.5rem; background:var(--bg-card); border:1px dashed var(--border-subtle); border-radius:16px; color:var(--text-muted); max-width:650px; margin:0 auto;">
          <i class="fa-solid fa-box-open fa-3x" style="margin-bottom:1rem; opacity:0.5; color:var(--edge-cyan-glow); display:block;"></i>
          <h3 style="color:#fff; margin-bottom:0.5rem;">جاري تحديث قائمة باقاتنا الجديدة</h3>
          <p style="font-size:0.95rem; margin-bottom:1.5rem;">يمكنك في الوقت الحالي التوجه مباشرة لنموذج الطلب وتحديد المواصفات التي ترغب بها وسنوافيك بالتسعير فوراً عبر الواتساب.</p>
          <a href="#order-wizard-section" class="btn btn-primary">
            <i class="fa-solid fa-paper-plane"></i> طلب تصميم مخصص الآن
          </a>
        </div>
      `;
      return;
    }

    categoryMeta.forEach(cat => {
      const catPackages = allPackages.filter(p => p.category === cat.id);
      if (catPackages.length === 0) return;

      const section = document.createElement('div');
      section.className = 'pricing-cat-wrapper';

      const cardsHtml = catPackages.map(pkg => {
        const badgeHtml = pkg.badge ? `<div class="popular-badge">${pkg.badge}</div>` : '';
        const featuresHtml = (pkg.features || []).map(f => `
          <div class="feature-item">
            <i class="fa-solid fa-circle-check feature-check"></i>
            <span>${f}</span>
          </div>
        `).join('');

        const pkgId = pkg._id || pkg.id;

        return `
          <div class="price-card ${pkg.popular ? 'popular' : ''}">
            ${badgeHtml}
            <h4 class="price-card-title">${pkg.name}</h4>
            <p class="price-card-desc">${pkg.description || ''}</p>
            <div class="price-value-box">
              <span class="price-amount">${pkg.price}</span>
              <span class="price-currency">${pkg.currency || 'ج.م'}</span>
              <span class="price-period">/ ${pkg.period || 'للتصميم'}</span>
            </div>
            <div class="price-features-list">
              ${featuresHtml}
            </div>
            <button class="btn ${pkg.popular ? 'btn-primary' : 'btn-outline'} btn-select-package" 
                    data-pkg-id="${pkgId}" 
                    data-cat-id="${cat.id}"
                    data-pkg-name="${pkg.name}"
                    data-pkg-price="${pkg.price}">
              <i class="fa-solid fa-cart-shopping"></i> اختر هذه الخدمة للطلب
            </button>
          </div>
        `;
      }).join('');

      section.innerHTML = `
        <div class="pricing-cat-header">
          <div class="pricing-cat-icon">
            <i class="${cat.icon}"></i>
          </div>
          <div class="pricing-cat-info">
            <h3>${cat.title}</h3>
            <p>${cat.subtitle}</p>
          </div>
        </div>
        <div class="pricing-cards-grid">
          ${cardsHtml}
        </div>
      `;

      pricingContainer.appendChild(section);
    });

    // ربط أزرار اختيار الباقة للتوجه السريع للويزارد
    document.querySelectorAll('.btn-select-package').forEach(btn => {
      btn.addEventListener('click', () => {
        const pkgId = btn.getAttribute('data-pkg-id');
        const catId = btn.getAttribute('data-cat-id');
        const pkgName = btn.getAttribute('data-pkg-name');
        const pkgPrice = btn.getAttribute('data-pkg-price');

        selectPackageAndGoToWizard({
          id: pkgId,
          categoryId: catId,
          name: pkgName,
          price: pkgPrice
        });
      });
    });
  }

  // التوجيه التلقائي للويزارد عند اختيار خدمة من قائمة الأسعار
  function selectPackageAndGoToWizard(pkg) {
    orderState.selectedService = pkg;

    // تحديد الكارت في Step 1
    document.querySelectorAll('.service-choice-item').forEach(item => {
      if (item.getAttribute('data-service-id') === pkg.categoryId) {
        item.classList.add('selected');
      } else {
        item.classList.remove('selected');
      }
    });

    // ضبط القائمة المنسدلة للخدمة الفرعية
    const subSelect = document.getElementById('sub-service-select');
    if (subSelect) {
      updateSubServices(pkg.categoryId);
      subSelect.value = pkg.id;
    }

    // الانتقال المباشر للخطوة 2 أو التمرير للويزارد
    goToStep(2);
    const orderSection = document.getElementById('order-wizard-section');
    if (orderSection) {
      orderSection.scrollIntoView({ behavior: 'smooth' });
    }
  }

  window.requestSpecificCategory = function (catId, projectTitle) {
    closePortfolioModal();
    const pkg = {
      id: catId + '-custom',
      categoryId: catId,
      name: `طلب مخصص مستوحى من: ${projectTitle}`,
      price: 'حسب التفاصيل'
    };
    selectPackageAndGoToWizard(pkg);
  };

  /* ==========================================================================
     4. الويزارد الذكي لتقديم الطلب (Interactive Order Wizard)
     ========================================================================== */
  const stepIndicators = document.querySelectorAll('.wizard-stepper .step-indicator');
  const stepPanes = document.querySelectorAll('.wizard-step-pane');
  const btnPrev = document.getElementById('wizard-prev-btn');
  const btnNext = document.getElementById('wizard-next-btn');

  function goToStep(stepNumber) {
    if (stepNumber < 1 || stepNumber > 5) return;
    orderState.currentStep = stepNumber;

    // تحديث مؤشرات الخطوات
    stepIndicators.forEach((ind, index) => {
      const stepIdx = index + 1;
      ind.classList.remove('active', 'completed');
      if (stepIdx === stepNumber) {
        ind.classList.add('active');
      } else if (stepIdx < stepNumber) {
        ind.classList.add('completed');
      }
    });

    // إظهار نافذة الخطوة
    stepPanes.forEach((pane) => {
      const paneStep = parseInt(pane.getAttribute('data-step'), 10);
      if (paneStep === stepNumber) {
        pane.classList.add('active');
      } else {
        pane.classList.remove('active');
      }
    });

    // التحكم في أزرار التنقل السفلية
    if (stepNumber === 1) {
      btnPrev.style.display = 'none';
      btnNext.innerHTML = 'التالي: الألوان والمراجع <i class="fa-solid fa-arrow-left"></i>';
      btnNext.style.display = 'inline-flex';
    } else if (stepNumber === 2) {
      btnPrev.style.display = 'inline-flex';
      btnNext.innerHTML = 'التالي: بيانات التواصل <i class="fa-solid fa-arrow-left"></i>';
      btnNext.style.display = 'inline-flex';
    } else if (stepNumber === 3) {
      btnPrev.style.display = 'inline-flex';
      btnNext.innerHTML = 'التالي: تفاصيل طلبك <i class="fa-solid fa-arrow-left"></i>';
      btnNext.style.display = 'inline-flex';
    } else if (stepNumber === 4) {
      btnPrev.style.display = 'inline-flex';
      btnNext.innerHTML = 'مراجعة وتأكيد الطلب <i class="fa-solid fa-check"></i>';
      btnNext.style.display = 'inline-flex';
      // تنشيط الفورم الشرطي المناسب
      activateConditionalForm();
    } else if (stepNumber === 5) {
      btnPrev.style.display = 'inline-flex';
      btnNext.style.display = 'none'; // في الخطوة الخامسة يتم الإرسال عبر الواتساب مباشرة
      buildOrderSummary();
    }
  }

  // الضغط المباشر على رأس الخطوة
  stepIndicators.forEach((ind) => {
    ind.addEventListener('click', () => {
      const targetStep = parseInt(ind.getAttribute('data-step-target'), 10);
      // يسمح بالرجوع للخطوات السابقة أو التقدم إذا تم تحديد الخدمة
      if (targetStep < orderState.currentStep || validateCurrentStep()) {
        goToStep(targetStep);
      }
    });
  });

  // زر التالي
  btnNext?.addEventListener('click', () => {
    if (validateCurrentStep()) {
      goToStep(orderState.currentStep + 1);
    }
  });

  // زر السابق
  btnPrev?.addEventListener('click', () => {
    goToStep(orderState.currentStep - 1);
  });

  // التحقق من صحة مدخلات الخطوة الحالية
  function validateCurrentStep() {
    if (orderState.currentStep === 1) {
      if (!orderState.selectedService) {
        alert('يرجى اختيار نوع الخدمة أو الباقة المطلوبة للمتابعة.');
        return false;
      }
      return true;
    }

    if (orderState.currentStep === 2) {
      // الألوان والمراجع اختيارية ولكن يتم حفظها
      saveColorsFromInputs();
      return true;
    }

    if (orderState.currentStep === 3) {
      const name = document.getElementById('client-name')?.value.trim();
      const phone = document.getElementById('client-phone')?.value.trim();
      if (!name) {
        alert('يرجى كتابة الاسم الكريم للمتابعة.');
        document.getElementById('client-name')?.focus();
        return false;
      }
      if (!phone || phone.length < 8) {
        alert('يرجى كتابة رقم هاتف / واتساب صحيح للتواصل وتأكيد الطلب.');
        document.getElementById('client-phone')?.focus();
        return false;
      }
      orderState.contact.name = name;
      orderState.contact.phone = phone;
      orderState.contact.email = document.getElementById('client-email')?.value.trim() || 'غير محدد';
      orderState.contact.brandName = document.getElementById('client-brand')?.value.trim() || 'غير محدد';
      return true;
    }

    if (orderState.currentStep === 4) {
      saveServiceDetails();
      return true;
    }

    return true;
  }

  /* ==========================================================================
     الخطوة 1: اختيار الخدمة
     ========================================================================== */
  const serviceCards = document.querySelectorAll('.service-choice-item');
  const subServiceSelect = document.getElementById('sub-service-select');

  serviceCards.forEach(card => {
    card.addEventListener('click', () => {
      serviceCards.forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      const catId = card.getAttribute('data-service-id');
      const catName = card.getAttribute('data-service-name');
      const basePrice = card.getAttribute('data-base-price');

      orderState.selectedService = {
        categoryId: catId,
        categoryName: catName,
        id: catId + '-custom',
        name: `خدمة ${catName}`,
        price: basePrice
      };

      updateSubServices(catId);
    });
  });

  async function updateSubServices(catId) {
    if (!subServiceSelect) return;

    if (!publicPackagesList || publicPackagesList.length === 0) {
      await fetchPublicPackages();
    }

    const catPackages = publicPackagesList.filter(p => p.category === catId);

    subServiceSelect.innerHTML = `<option value="">-- اختر الباقة المحددة أو اختر باقة مخصصة --</option>`;
    catPackages.forEach(pkg => {
      const opt = document.createElement('option');
      opt.value = pkg._id || pkg.id;
      opt.textContent = `${pkg.name} (${pkg.price} ${pkg.currency || 'ج.م'})`;
      subServiceSelect.appendChild(opt);
    });

    // خيار مخصص
    const customOpt = document.createElement('option');
    customOpt.value = catId + '-custom';
    customOpt.textContent = `طلب مخصص حسب مواصفاتي (سعر تفصيلي)`;
    subServiceSelect.appendChild(customOpt);
  }

  subServiceSelect?.addEventListener('change', (e) => {
    const val = e.target.value;
    if (!val) return;

    const catId = orderState.selectedService?.categoryId;
    const pkg = publicPackagesList.find(p => (p._id || p.id) == val);

    if (pkg) {
      orderState.selectedService.id = pkg._id || pkg.id;
      orderState.selectedService.name = pkg.name;
      orderState.selectedService.price = pkg.price;
    } else {
      orderState.selectedService.id = val;
      orderState.selectedService.name = 'طلب مخصص';
      orderState.selectedService.price = 'حسب الاتفاق';
    }
  });

  /* ==========================================================================
     الخطوة 2: الألوان والمراجع ورفع الملفات
     ========================================================================== */
  const primaryPicker = document.getElementById('color-primary');
  const primaryHex = document.getElementById('hex-primary');
  const secondaryPicker = document.getElementById('color-secondary');
  const secondaryHex = document.getElementById('hex-secondary');
  const accentPicker = document.getElementById('color-accent');
  const accentHex = document.getElementById('hex-accent');

  // مزامنة أداة اختيار اللون مع كود HEX
  function setupColorSync(picker, hexInput, stateKey) {
    if (!picker || !hexInput) return;
    picker.addEventListener('input', () => {
      hexInput.value = picker.value.toUpperCase();
      orderState.colors[stateKey] = picker.value;
    });
    hexInput.addEventListener('input', () => {
      let val = hexInput.value;
      if (!val.startsWith('#')) val = '#' + val;
      if (/^#[0-9A-F]{6}$/i.test(val)) {
        picker.value = val;
        orderState.colors[stateKey] = val;
      }
    });
  }

  setupColorSync(primaryPicker, primaryHex, 'primary');
  setupColorSync(secondaryPicker, secondaryHex, 'secondary');
  setupColorSync(accentPicker, accentHex, 'accent');

  // الباليتات المقترحة السريعة
  document.querySelectorAll('.preset-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const c1 = chip.getAttribute('data-c1');
      const c2 = chip.getAttribute('data-c2');
      const c3 = chip.getAttribute('data-c3');

      if (primaryPicker && primaryHex) {
        primaryPicker.value = c1;
        primaryHex.value = c1.toUpperCase();
        orderState.colors.primary = c1;
      }
      if (secondaryPicker && secondaryHex) {
        secondaryPicker.value = c2;
        secondaryHex.value = c2.toUpperCase();
        orderState.colors.secondary = c2;
      }
      if (accentPicker && accentHex) {
        accentPicker.value = c3;
        accentHex.value = c3.toUpperCase();
        orderState.colors.accent = c3;
      }
    });
  });

  function saveColorsFromInputs() {
    if (primaryPicker) orderState.colors.primary = primaryPicker.value;
    if (secondaryPicker) orderState.colors.secondary = secondaryPicker.value;
    if (accentPicker) orderState.colors.accent = accentPicker.value;
  }

  // رفع الملفات بالسحب والإفلات أو الزر
  const dropzone = document.getElementById('file-dropzone');
  const fileInput = document.getElementById('brand-file-input');
  const filesListContainer = document.getElementById('uploaded-files-list');

  dropzone?.addEventListener('click', () => fileInput?.click());

  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone?.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.add('drag-over');
    });
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone?.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.remove('drag-over');
    });
  });

  dropzone?.addEventListener('drop', (e) => {
    if (e.dataTransfer?.files) {
      handleFiles(e.dataTransfer.files);
    }
  });

  fileInput?.addEventListener('change', (e) => {
    if (e.target.files) {
      handleFiles(e.target.files);
    }
  });

  function compressImageIfNeeded(file) {
    return new Promise((resolve) => {
      // إذا لم يكن صورة عادية (مثل PDF أو SVG)، نقرأه كما هو
      if (!file.type.startsWith('image/') || file.type === 'image/svg+xml') {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
        return;
      }

      // ضغط وتصغير الصور الكبيرة تلقائياً لتجنب حدود الحجم وضمان سرعة الإرسال الفائقة
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const maxDimension = 1400; // دقة ممتازة جداً لمراجعة التصميم
          let w = img.width;
          let h = img.height;

          if (w > maxDimension || h > maxDimension) {
            if (w > h) {
              h = Math.round((h * maxDimension) / w);
              w = maxDimension;
            } else {
              w = Math.round((w * maxDimension) / h);
              h = maxDimension;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, w, h);

          // تصدير الصورة المضغوطة بجودة 0.8
          const compressed = canvas.toDataURL('image/jpeg', 0.82);
          resolve(compressed);
        };
        img.onerror = () => resolve(e.target.result);
        img.src = e.target.result;
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }

  async function handleFiles(files) {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // أقصى حجم 15 ميجابايت قبل الضغط
      if (file.size > 15 * 1024 * 1024) {
        alert(`الملف "${file.name}" حجمه كبير جداً (أكبر من 15MB). يرجى تقليل حجمه أو إرساله عبر واتساب.`);
        continue;
      }

      const dataUrl = await compressImageIfNeeded(file);
      orderState.uploadedFiles.push({
        name: file.name,
        type: file.type || 'application/octet-stream',
        size: file.size,
        data: dataUrl
      });
    }
    renderFilesList();
  }

  function renderFilesList() {
    if (!filesListContainer) return;
    filesListContainer.innerHTML = '';
    orderState.uploadedFiles.forEach((fileItem, index) => {
      const fileName = typeof fileItem === 'string' ? fileItem : fileItem.name;
      const isImg = typeof fileItem === 'object' && fileItem.data && (fileItem.type?.startsWith('image/') || fileItem.data.startsWith('data:image'));
      const item = document.createElement('div');
      item.className = 'file-item-pill';
      item.innerHTML = `
        <span style="display:flex; align-items:center; gap:0.5rem;">
          ${isImg ? `<img src="${fileItem.data}" style="width:24px; height:24px; object-fit:cover; border-radius:4px;" alt="معاينة">` : '<i class="fa-regular fa-file" style="color:var(--edge-cyan-glow);"></i>'}
          ${fileName}
        </span>
        <button class="file-remove-btn" data-index="${index}" title="حذف الملف">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      `;
      filesListContainer.appendChild(item);
    });

    filesListContainer.querySelectorAll('.file-remove-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(btn.getAttribute('data-index'), 10);
        orderState.uploadedFiles.splice(idx, 1);
        renderFilesList();
      });
    });
  }

  /* ==========================================================================
     الخطوة 4: تفاصيل الطلب المخصصة حسب نوع التصميم
     ========================================================================== */
  function activateConditionalForm() {
    const catId = orderState.selectedService?.categoryId || 'social';
    document.querySelectorAll('.service-conditional-box').forEach(box => {
      box.classList.remove('active');
    });

    const targetBox = document.getElementById(`conditional-${catId}`);
    if (targetBox) {
      targetBox.classList.add('active');
    }
  }

  function saveServiceDetails() {
    const catId = orderState.selectedService?.categoryId || 'social';
    const details = {};

    if (catId === 'social') {
      const platforms = Array.from(document.querySelectorAll('input[name="social-platforms"]:checked')).map(el => el.value);
      details['المنصات المطلوبة'] = platforms.length > 0 ? platforms.join('، ') : 'غير محدد';
      details['نوع المنشور'] = document.getElementById('social-format')?.value || 'بوست فردي';
      details['فكرة التصميم والمحتوى المكتوب'] = document.getElementById('social-content-text')?.value.trim() || 'سيتم إرسالها لاحقاً';
      details['الهدف من التصميم'] = document.getElementById('social-goal')?.value || 'تفاعلي وترويجي';
    } else if (catId === 'print') {
      details['نوع المطبوعة'] = document.getElementById('print-item-type')?.value || 'كارت شخصي';
      details['المقاس المطلوب'] = document.getElementById('print-dimensions')?.value.trim() || 'مقاس قياسي ستاندرد';
      details['اتجاه التصميم'] = document.getElementById('print-sides')?.value || 'وجهين';
      details['مواصفات الطباعة والخامات'] = document.getElementById('print-specs-notes')?.value.trim() || 'حسب توصية المصمم';
      details['النصوص والبيانات للطباعة'] = document.getElementById('print-content-text')?.value.trim() || 'سيتم إرسالها';
    } else if (catId === 'branding') {
      details['اسم البراند عربي / إنجليزي'] = document.getElementById('brand-full-name')?.value.trim() || orderState.contact.brandName;
      details['مجال ونشاط الشركة بالتفصيل'] = document.getElementById('brand-industry-desc')?.value.trim() || 'غير محدد';
      details['الجمهور المستهدف'] = document.getElementById('brand-target-audience')?.value.trim() || 'عام';
      details['الطابع والنمط المفضل'] = document.getElementById('brand-style-vibe')?.value || 'مودرن وعصري';
      details['حالة الشعار'] = document.getElementById('brand-logo-status')?.value || 'شعار وهوية جديدة من الصفر';
      details['ملاحظات وأفكار ملهمة'] = document.getElementById('brand-extra-notes')?.value.trim() || 'لا توجد ملاحظات إضافية';
    }

    orderState.serviceDetails = details;
  }

  /* ==========================================================================
     الخطوة 5: ملخص الطلب والإرسال عبر واتساب
     ========================================================================== */
  const summaryContent = document.getElementById('order-summary-content');

  function buildOrderSummary() {
    if (!summaryContent) return;

    let detailsRowsHtml = '';
    for (const [key, val] of Object.entries(orderState.serviceDetails)) {
      detailsRowsHtml += `
        <div class="summary-row">
          <span class="summary-key">${key}:</span>
          <span class="summary-val">${val}</span>
        </div>
      `;
    }

    const filesStr = orderState.uploadedFiles.length > 0
      ? orderState.uploadedFiles.map(f => typeof f === 'string' ? f : f.name).join('، ')
      : 'لم يتم إرفاق ملفات (سيتم إرسالها عبر الشات)';

    summaryContent.innerHTML = `
      <div class="summary-row">
        <span class="summary-key">الخدمة المختارة:</span>
        <span class="summary-val" style="color:var(--edge-cyan-glow);">${orderState.selectedService?.name || 'خدمة تصميم'}</span>
      </div>
      <div class="summary-row">
        <span class="summary-key">صاحب الطلب:</span>
        <span class="summary-val">${orderState.contact.name} (${orderState.contact.phone})</span>
      </div>
      <div class="summary-row">
        <span class="summary-key">اسم المشروع / البراند:</span>
        <span class="summary-val">${orderState.contact.brandName || 'غير محدد'}</span>
      </div>
      <div class="summary-row">
        <span class="summary-key">لوحة ألوان الهوية المختارة:</span>
        <span class="summary-val">
          <span style="display:inline-flex; align-items:center; gap:6px;">
            <span style="display:inline-block; width:14px; height:14px; border-radius:50%; background:${orderState.colors.primary};"></span> ${orderState.colors.primary}
            <span style="display:inline-block; width:14px; height:14px; border-radius:50%; background:${orderState.colors.secondary};"></span> ${orderState.colors.secondary}
            <span style="display:inline-block; width:14px; height:14px; border-radius:50%; background:${orderState.colors.accent};"></span> ${orderState.colors.accent}
          </span>
        </span>
      </div>
      <div class="summary-row">
        <span class="summary-key">الملفات والمرفقات:</span>
        <span class="summary-val">${filesStr}</span>
      </div>
      ${detailsRowsHtml}
      <div class="summary-row summary-total">
        <span class="summary-key" style="font-weight:700; color:#fff;">السعر التقديري:</span>
        <span class="summary-val">${orderState.selectedService?.price} ج.م</span>
      </div>
    `;
  }

  // توليد رسالة واتساب منسقة باحترافية
  function generateWhatsAppMessage() {
    let msg = `*🚀 طلب تصميم جديد عبر منصة EDGE Studio*\n`;
    msg += `------------------------------------\n`;
    msg += `*📌 الخدمة المطلوبة:* ${orderState.selectedService?.name || 'غير محدد'}\n`;
    msg += `*💰 السعر التقديري:* ${orderState.selectedService?.price} ج.م\n\n`;

    msg += `*👤 بيانات العميل:*\n`;
    msg += `• الاسم: ${orderState.contact.name}\n`;
    msg += `• الهاتف: ${orderState.contact.phone}\n`;
    msg += `• البريد: ${orderState.contact.email}\n`;
    msg += `• اسم البراند/المشروع: ${orderState.contact.brandName}\n\n`;

    msg += `*🎨 لوحة الألوان المختارة:*\n`;
    msg += `• اللون الأساسي: ${orderState.colors.primary}\n`;
    msg += `• اللون الثانوي: ${orderState.colors.secondary}\n`;
    msg += `• لون اللمسات: ${orderState.colors.accent}\n\n`;

    msg += `*📝 تفاصيل الطلب:*\n`;
    for (const [key, val] of Object.entries(orderState.serviceDetails)) {
      msg += `• ${key}: ${val}\n`;
    }

    if (orderState.uploadedFiles.length > 0) {
      const fileNames = orderState.uploadedFiles.map(f => typeof f === 'string' ? f : f.name).join('، ');
      msg += `\n*📎 الملفات المرفقة بالتجهيز:* ${fileNames}\n`;
    }

    msg += `\n------------------------------------\n`;
    msg += `_تم إرسال هذا الطلب عبر الموقع الرسمي لأكاديمية واستوديو EDGE_`;

    return encodeURIComponent(msg);
  }

  // حفظ الطلب في قاعدة بيانات MongoDB ونسخة احتياطية في localStorage
  async function saveOrderToStorage() {
    const newOrder = {
      id: 'ORD-' + Math.floor(1000 + Math.random() * 9000),
      createdAt: new Date().toISOString(),
      dateFormatted: new Date().toLocaleDateString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
      service: orderState.selectedService?.name || 'خدمة تصميم',
      category: orderState.selectedService?.categoryId || 'social',
      categoryName: orderState.selectedService?.categoryName || 'سوشيال ميديا',
      price: orderState.selectedService?.price || 150,
      clientName: orderState.contact.name,
      clientPhone: orderState.contact.phone,
      clientEmail: orderState.contact.email,
      brandName: orderState.contact.brandName,
      colors: { ...orderState.colors },
      uploadedFiles: [...orderState.uploadedFiles],
      details: { ...orderState.serviceDetails },
      status: 'pending', // pending, in_progress, completed, cancelled
      paymentStatus: 'unpaid' // unpaid, deposit_paid, fully_paid
    };

    // حفظ نسخة خفيفة في localStorage لتجنب تجاوز مساحة المتصفح (QuotaExceededError)
    try {
      const lightOrder = {
        ...newOrder,
        uploadedFiles: (newOrder.uploadedFiles || []).map(f => ({
          name: typeof f === 'string' ? f : f.name,
          size: f.size,
          type: f.type
        }))
      };
      const orders = JSON.parse(localStorage.getItem('edge_orders') || '[]');
      orders.unshift(lightOrder);
      localStorage.setItem('edge_orders', JSON.stringify(orders.slice(0, 50)));
    } catch (e) {
      console.warn('تجاوزت الطلبات مساحة localStorage، تم تجاوز التخزين المحلي والاعتماد على قاعدة البيانات.');
    }

    // إرسال كامل البيانات والملفات مباشرة إلى خادم وقاعدة بيانات MongoDB
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newOrder)
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.message || 'حدث خطأ في الخادم أثناء تسجيل الطلب');
    }

    return newOrder;
  }

  // زر الإرسال عبر واتساب
  const btnSendWhatsApp = document.getElementById('btn-send-whatsapp');
  btnSendWhatsApp?.addEventListener('click', () => {
    saveOrderToStorage();
    const encodedText = generateWhatsAppMessage();
    const waUrl = `https://wa.me/${STUDIO_WHATSAPP_NUMBER}?text=${encodedText}`;
    window.open(waUrl, '_blank');
  });

  // زر التأكيد والإرسال المباشر للاستوديو (بدون واتساب)
  const btnSubmitOrderDirect = document.getElementById('btn-submit-order-direct');
  btnSubmitOrderDirect?.addEventListener('click', async () => {
    const alertEl = document.getElementById('order-submit-alert');
    btnSubmitOrderDirect.disabled = true;
    btnSubmitOrderDirect.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري إرسال طلبك...';

    try {
      const order = await saveOrderToStorage();
      if (alertEl) {
        alertEl.style.display = 'block';
        alertEl.style.background = 'rgba(16,185,129,0.15)';
        alertEl.style.border = '1px solid rgba(16,185,129,0.4)';
        alertEl.style.color = '#10B981';
        alertEl.style.borderRadius = '10px';
        alertEl.style.padding = '12px 16px';
        alertEl.style.marginTop = '12px';
        alertEl.innerHTML = `<i class="fa-solid fa-circle-check"></i> تم إرسال طلبك رقم <strong>${order.id}</strong> بنجاح! سيتواصل معك فريق EDGE قريباً.`;
      }
      btnSubmitOrderDirect.innerHTML = '<i class="fa-solid fa-check"></i> تم الإرسال بنجاح ✅';
    } catch (e) {
      if (alertEl) {
        alertEl.style.display = 'block';
        alertEl.style.background = 'rgba(239,68,68,0.15)';
        alertEl.style.border = '1px solid rgba(239,68,68,0.4)';
        alertEl.style.color = '#EF4444';
        alertEl.style.borderRadius = '10px';
        alertEl.style.padding = '12px 16px';
        alertEl.style.marginTop = '12px';
        alertEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> حدث خطأ أثناء الإرسال. يرجى استخدام واتساب بدلاً من ذلك.';
      }
      btnSubmitOrderDirect.disabled = false;
      btnSubmitOrderDirect.innerHTML = '<i class="fa-solid fa-paper-plane"></i> تأكيد وإرسال الطلب للاستوديو الآن 🚀';
    }
  });

  // زر نسخ تفاصيل الطلب
  const btnCopyOrder = document.getElementById('btn-copy-order');
  btnCopyOrder?.addEventListener('click', () => {
    saveOrderToStorage();
    let plainText = `طلب تصميم جديد من منصة EDGE Studio\n\n`;
    plainText += `الخدمة: ${orderState.selectedService?.name}\n`;
    plainText += `السعر: ${orderState.selectedService?.price} ج.م\n`;
    plainText += `الاسم: ${orderState.contact.name} (${orderState.contact.phone})\n`;
    plainText += `اسم المشروع: ${orderState.contact.brandName}\n`;
    plainText += `الألوان: ${orderState.colors.primary}, ${orderState.colors.secondary}, ${orderState.colors.accent}\n\n`;
    plainText += `تفاصيل إضافية:\n`;
    for (const [key, val] of Object.entries(orderState.serviceDetails)) {
      plainText += `- ${key}: ${val}\n`;
    }

    navigator.clipboard.writeText(plainText).then(() => {
      const originalText = btnCopyOrder.innerHTML;
      btnCopyOrder.innerHTML = '<i class="fa-solid fa-check"></i> تم نسخ تفاصيل الطلب بنجاح!';
      setTimeout(() => {
        btnCopyOrder.innerHTML = originalText;
      }, 2500);
    });
  });

  /* ==========================================================================
     5. تبديل الوضع الليلي / الفاتح (Dark / Light Theme Toggle)
     ========================================================================== */
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const navBrandLogo = document.getElementById('nav-brand-logo');
  const currentTheme = localStorage.getItem('edge-theme') || 'dark';

  function updateLogoForTheme(theme) {
    if (!navBrandLogo) return;
    if (theme === 'light') {
      navBrandLogo.src = 'assets/img/logo-blue.png';
    } else {
      navBrandLogo.src = 'assets/img/logo-white.png';
    }
  }

  if (currentTheme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    if (themeToggleBtn) themeToggleBtn.innerHTML = '<i class="fa-solid fa-sun"></i>';
    updateLogoForTheme('light');
  } else {
    updateLogoForTheme('dark');
  }

  themeToggleBtn?.addEventListener('click', () => {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    if (isLight) {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('edge-theme', 'dark');
      themeToggleBtn.innerHTML = '<i class="fa-solid fa-moon"></i>';
      updateLogoForTheme('dark');
    } else {
      document.documentElement.setAttribute('data-theme', 'light');
      localStorage.setItem('edge-theme', 'light');
      themeToggleBtn.innerHTML = '<i class="fa-solid fa-sun"></i>';
      updateLogoForTheme('light');
    }
  });

  /* ==========================================================================
     6. القائمة المتجاوبة للموبايل (Mobile Navigation)
     ========================================================================== */
  const mobileMenuBtn = document.getElementById('mobile-menu-btn');
  const navMenu = document.getElementById('nav-menu');

  mobileMenuBtn?.addEventListener('click', () => {
    navMenu?.classList.toggle('open');
    const isOpen = navMenu?.classList.contains('open');
    mobileMenuBtn.innerHTML = isOpen ? '<i class="fa-solid fa-xmark"></i>' : '<i class="fa-solid fa-bars"></i>';
  });

  // إغلاق القائمة عند النقر على رابط
  document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      navMenu?.classList.remove('open');
      if (mobileMenuBtn) mobileMenuBtn.innerHTML = '<i class="fa-solid fa-bars"></i>';
    });
  });

  /* ==========================================================================
     7. متابعة التمرير وتحديث النافبار الثابت (ScrollSpy for Fixed Navbar)
     ========================================================================== */
  const spySections = document.querySelectorAll('section[id]');
  const spyNavLinks = document.querySelectorAll('.nav-menu .nav-link');

  window.addEventListener('scroll', () => {
    let currentId = '';
    const scrollPos = window.pageYOffset + 120;

    spySections.forEach(section => {
      const top = section.offsetTop;
      const height = section.offsetHeight;
      if (scrollPos >= top && scrollPos < top + height) {
        currentId = section.getAttribute('id');
      }
    });

    if (currentId) {
      spyNavLinks.forEach(link => {
        link.classList.remove('active');
        if (link.getAttribute('href') === `#${currentId}`) {
          link.classList.add('active');
        }
      });
    }
  }, { passive: true });

  /* ==========================================================================
     البدء والتشغيل الأولي
     ========================================================================== */
  renderPortfolio('all');
  renderPricing();
  goToStep(1);
});
