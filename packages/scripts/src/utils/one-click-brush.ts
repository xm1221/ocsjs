import { $message, $modal, $store, $ui, h, Project } from 'easy-us';
import { CXProject, ZHSProject, ZJYProject, IcveMoocProject, ICourseProject, YKTProject } from '../index';
import { BackgroundProject } from '../projects/background';
import { CommonProject } from '../projects/common';
import { getAnswererConfigProvider } from './answerer-connect';
import { createHero, createStatusBox, createSteps, type StatusType } from './ui';

const STORE_KEY = 'ocs.one-click-brush.v1';

export type OneClickStep = 'select' | 'answerer' | 'login' | 'course' | 'running' | 'done';

export interface OneClickBrushState {
	platformId: string;
	step: OneClickStep;
	/** 用户是否勾选「含作业/考试自动答题」 */
	withHomework: boolean;
	startedAt?: number;
}

export interface CoursePlatform {
	id: string;
	name: string;
	project: Project;
	loginUrl: string;
	homeUrl: string;
	/** 进入学习/作业后 URL 通常包含的特征 */
	studyUrlTest: RegExp;
	hints: string[];
}

export const COURSE_PLATFORMS: CoursePlatform[] = [
	{
		id: 'cx',
		name: '超星学习通',
		project: CXProject,
		loginUrl: 'https://passport2.chaoxing.com/login',
		homeUrl: 'https://i.chaoxing.com',
		studyUrlTest: /(studentstudy|work\/dowork|examtest)/i,
		hints: ['登录后打开「课程」', '进入章节视频页或作业/考试页', '脚本将自动刷课或答题，请勿最小化窗口']
	},
	{
		id: 'zhs',
		name: '智慧树',
		project: ZHSProject,
		loginUrl: 'https://passport.zhihuishu.com/login',
		homeUrl: 'https://onlineweb.zhihuishu.com/onlinestuh5',
		studyUrlTest: /(studyvideoh5|studyplush5|fusioncourseh5|zhihuishu\.com)/i,
		hints: ['登录后进入「学堂」选课程', '打开视频学习或作业考试页面', '共享课可自动切换下一节']
	},
	{
		id: 'zjy',
		name: '职教云',
		project: ZJYProject,
		loginUrl: 'https://zjy2.icve.com.cn/portal/login.html',
		homeUrl: 'https://zjy2.icve.com.cn/portalproject/themes/default/aikchedt/hdp_xn_new.html',
		studyUrlTest: /zjy2\.icve\.com\.cn/i,
		hints: ['登录门户后进入课程', '点击章节开始学习', '视频页脚本会自动播放并打点']
	},
	{
		id: 'icve',
		name: '智慧职教',
		project: IcveMoocProject,
		loginUrl: 'https://sso.icve.com.cn/sso/auth',
		homeUrl: 'https://mooc.icve.com.cn',
		studyUrlTest: /icve\.com\.cn/i,
		hints: ['登录后进入 MOOC 课程', '打开课件或测验页面', '等待面板提示自动运行']
	},
	{
		id: 'icourse',
		name: '爱课程',
		project: ICourseProject,
		loginUrl: 'https://www.icourses.cn/web/sword/portal/login',
		homeUrl: 'https://www.icourses.cn',
		studyUrlTest: /icourses\.cn/i,
		hints: ['登录后进入已选课程', '打开视频或作业界面', '脚本检测到页面后自动开始']
	},
	{
		id: 'ykt',
		name: '雨课堂',
		project: YKTProject,
		loginUrl: 'https://www.yuketang.cn/web/?next=/v2/web/index',
		homeUrl: 'https://www.yuketang.cn/v2/web/index',
		studyUrlTest: /yuketang\.cn/i,
		hints: ['登录雨课堂网页版', '进入课程章节学习', '视频与作业页将自动运行对应脚本']
	}
];

function loadState(): OneClickBrushState {
	const saved = $store.get(STORE_KEY) as Partial<OneClickBrushState> | undefined;
	return {
		platformId: saved?.platformId ?? 'cx',
		step: saved?.step ?? 'select',
		withHomework: saved?.withHomework ?? true,
		startedAt: saved?.startedAt
	};
}

function saveState(state: OneClickBrushState) {
	$store.set(STORE_KEY, state);
}

function getPlatform(id: string): CoursePlatform | undefined {
	return COURSE_PLATFORMS.find((p) => p.id === id);
}

function hasAnswererConfigured(): boolean {
	const aws = CommonProject.scripts.settings.methods.getWorkOptions?.().answererWrappers;
	if (aws?.length) return true;
	return (CommonProject.scripts.settings.cfg.answererWrappers || []).length > 0;
}

/** 打开全局设置中的题库配置弹窗 */
export function openAnswererConfigModal() {
	BackgroundProject.scripts.render.methods.pin(CommonProject.scripts.settings);
	const tryOpen = () => {
		const btn =
			$elementsAnswererButton() ||
			document.querySelector<HTMLElement>('config-element [value*="题库"]') ||
			document.querySelector<HTMLElement>('config-element button');
		btn?.click();
	};
	setTimeout(tryOpen, 400);
}

function $elementsAnswererButton(): HTMLElement | null {
	for (const el of Array.from(document.querySelectorAll('config-element'))) {
		const label = el.querySelector('label');
		if (label?.textContent?.includes('题库配置')) {
			const provider = el.querySelector('button, [role="button"]') as HTMLElement | null;
			if (provider) return provider;
		}
	}
	return null;
}

function pinPlatformGuide(platform: CoursePlatform) {
	const guide =
		(platform.project.scripts as Record<string, { namespace?: string }>).guide ||
		Object.values(platform.project.scripts).find((s) => String(s.name || '').includes('提示'));
	if (guide) {
		(guide as { projectName?: string }).projectName = platform.project.name;
		BackgroundProject.scripts.render.methods.pin(guide as never);
	}
}

function stepLabel(step: OneClickStep): string {
	const map: Record<OneClickStep, string> = {
		select: '选择平台',
		answerer: '配置题库',
		login: '登录账号',
		course: '进入课程',
		running: '自动运行',
		done: '已完成'
	};
	return map[step];
}

function stepIndex(step: OneClickStep): number {
	const order: OneClickStep[] = ['select', 'answerer', 'login', 'course', 'running', 'done'];
	return Math.max(0, order.indexOf(step));
}

/**
 * 一键刷课向导面板（选择 → 配置 → 登录 → 进入课程 → 等待脚本 → 完成）
 */
export function createOneClickBrushPanel(options?: { onStepChange?: (step: OneClickStep) => void }): HTMLElement {
	const state = loadState();
	const { el: statusEl, setStatus } = createStatusBox();
	setStatus('按下方步骤操作，或点击「一键开始」串联流程。', 'info');

	const platformSelect = h(
		'select',
		{ className: 'base-style-active-form-control ocb-platform-select' },
		COURSE_PLATFORMS.map((p) =>
			h('option', { value: p.id, selected: p.id === state.platformId ? true : undefined }, p.name)
		)
	);

	const homeworkCheck = h('input', {
		type: 'checkbox',
		checked: state.withHomework,
		className: 'base-style-switch'
	});
	const homeworkRow = h('label', { className: 'ocb-checkbox-row' }, [
		homeworkCheck,
		h('span', '同时启用作业/考试自动答题（需配置题库）')
	]);

	const stepHint = h('div', { className: 'ocb-step-hint' });
	const actionRow = h('div', { className: 'ocb-actions' });

	const stepDescriptions: Record<OneClickStep, (p: CoursePlatform) => string> = {
		select: (p) => `选择网课平台（当前：${p.name}），勾选是否需要作业/考试自动答题。`,
		answerer: () =>
			getAnswererConfigProvider()
				? '点击「打开题库配置」，使用官方题库一键获取或粘贴配置。'
				: '点击「打开题库配置」，在弹窗中粘贴题库 JSON 配置。',
		login: (p) => `在新标签页打开 ${p.name} 登录页，完成账号登录。`,
		course: (p) => `打开课程首页，进入目标章节的视频或作业/考试页面。${p.hints.join('；')}`,
		running: () => '保持学习页在前台，脚本自动刷课或答题；可使用「检测当前页面」确认是否已接管。',
		done: () => '流程已结束，可点击「再来一次」处理下一门课。'
	};

	const refreshStepUi = () => {
		const platform = getPlatform(state.platformId);
		if (!platform) return;

		stepHint.replaceChildren(
			h('b', `当前：${stepLabel(state.step)}（${stepIndex(state.step) + 1}/6）`),
			h(
				'div',
				{ className: 'secondary', style: { marginTop: '6px', fontSize: '12px', lineHeight: '18px' } },
				stepDescriptions[state.step](platform)
			)
		);

		actionRow.replaceChildren();

		const addBtn = (text: string, onclick: () => void, primary = false) => {
			const btn = $ui.button(text, {
				className: primary ? 'aw-connect-btn' : 'base-style-button-secondary'
			});
			btn.onclick = onclick;
			actionRow.append(btn);
		};

		switch (state.step) {
			case 'select':
				addBtn(
					'下一步：检查题库',
					() => {
						state.platformId = (platformSelect as HTMLSelectElement).value;
						state.withHomework = (homeworkCheck as HTMLInputElement).checked;
						state.step = state.withHomework && !hasAnswererConfigured() ? 'answerer' : 'login';
						saveState(state);
						options?.onStepChange?.(state.step);
						refreshStepUi();
					},
					true
				);
				break;
			case 'answerer':
				addBtn('打开题库配置', () => openAnswererConfigModal());
				addBtn(
					'已配置，去登录',
					() => {
						if (state.withHomework && !hasAnswererConfigured()) {
							$message.warn('尚未检测到题库配置，作业/考试可能无法自动答题。');
						}
						state.step = 'login';
						saveState(state);
						options?.onStepChange?.(state.step);
						refreshStepUi();
					},
					true
				);
				break;
			case 'login':
				addBtn('打开登录页', () => {
					window.open(platform.loginUrl, '_blank');
					setStatus('请在登录页完成账号登录，完成后点击「已登录」。', 'info');
				});
				addBtn(
					'已登录，进入课程',
					() => {
						state.step = 'course';
						saveState(state);
						options?.onStepChange?.(state.step);
						refreshStepUi();
					},
					true
				);
				break;
			case 'course':
				addBtn('打开课程首页', () => {
					window.open(platform.homeUrl, '_blank');
					pinPlatformGuide(platform);
					setStatus('请在课程列表中进入目标章节（视频/作业页）。', 'info');
				});
				addBtn(
					'已进入学习页，开始等待',
					() => {
						state.step = 'running';
						state.startedAt = Date.now();
						saveState(state);
						pinPlatformGuide(platform);
						options?.onStepChange?.(state.step);
						setStatus('已进入自动运行阶段：请保持页面在前台，脚本将自动刷课/答题。', 'info');
						refreshStepUi();
						startRunningWatch(platform, setStatus, () => {
							state.step = 'done';
							saveState(state);
							options?.onStepChange?.('done');
							refreshStepUi();
						});
					},
					true
				);
				break;
			case 'running':
				addBtn('检测当前页面', () => {
					if (platform.studyUrlTest.test(location.href)) {
						setStatus('当前页面已由 OCS 脚本接管，请耐心等待完成。', 'success');
					} else {
						setStatus('尚未检测到学习/作业页面，请进入课程章节后重试。', 'error');
					}
				});
				addBtn(
					'标记为已完成',
					() => {
						state.step = 'done';
						saveState(state);
						options?.onStepChange?.('done');
						setStatus('本次一键刷课流程已结束。', 'success');
						refreshStepUi();
					},
					true
				);
				break;
			case 'done':
				addBtn(
					'再来一次',
					() => {
						state.step = 'select';
						state.startedAt = undefined;
						saveState(state);
						options?.onStepChange?.('select');
						setStatus('已重置向导，可重新选择平台。', 'info');
						refreshStepUi();
					},
					true
				);
				break;
		}
	};

	const oneClickStart = $ui.button('🚀 一键开始', { className: 'aw-connect-btn ocb-one-click' });
	oneClickStart.onclick = () => {
		state.platformId = (platformSelect as HTMLSelectElement).value;
		state.withHomework = (homeworkCheck as HTMLInputElement).checked;
		const platform = getPlatform(state.platformId);
		if (!platform) return;

		state.step = state.withHomework && !hasAnswererConfigured() ? 'answerer' : 'login';
		saveState(state);

		if (state.step === 'answerer') {
			setStatus('需要先配置题库才能自动答题，正在打开配置…', 'info');
			openAnswererConfigModal();
			$message.info('配置题库后点击「已配置，去登录」继续。');
			options?.onStepChange?.(state.step);
			refreshStepUi();
			return;
		}

		window.open(platform.loginUrl, '_blank');
		setTimeout(() => window.open(platform.homeUrl, '_blank'), 600);
		pinPlatformGuide(platform);
		state.step = 'course';
		saveState(state);
		setStatus('已打开登录页与课程首页：请登录并进入章节学习页，然后点击「已进入学习页，开始等待」。', 'info');
		options?.onStepChange?.(state.step);
		refreshStepUi();
	};

	platformSelect.onchange = () => {
		state.platformId = (platformSelect as HTMLSelectElement).value;
		saveState(state);
	};
	homeworkCheck.onchange = () => {
		state.withHomework = (homeworkCheck as HTMLInputElement).checked;
		saveState(state);
	};

	if (state.step === 'running') {
		const platform = getPlatform(state.platformId);
		if (platform) {
			startRunningWatch(platform, setStatus, () => {
				state.step = 'done';
				saveState(state);
				refreshStepUi();
			});
		}
	}

	refreshStepUi();

	const stepsBar = createSteps(['选择平台', '配置题库', '登录', '进入课程', '等待完成']);

	return h('div', { className: 'ocb-wizard' }, [
		createHero({
			icon: '🚀',
			title: '一键刷课',
			subtitle: '点击、选择平台、配置题库、登录并开始；进入学习页后自动等待脚本完成',
			extra: getAnswererConfigProvider()
				? h('span', ['官方题库：', h('b', getAnswererConfigProvider()!.name)])
				: h('span', '可在「全局设置」中配置题库以启用自动答题')
		}),
		stepsBar,
		statusEl,
		h('div', { className: 'ocb-form' }, [
			h('div', { className: 'ocb-field' }, [h('label', '网课平台'), platformSelect]),
			homeworkRow
		]),
		stepHint,
		h('div', { className: 'ocb-actions-primary' }, [oneClickStart]),
		actionRow,
		$ui.notes([
			'一键开始会打开登录页与课程首页，不会代替你输入账号密码。',
			'视频刷课、章节跳转由各平台脚本自动完成；作业/考试需题库配置。',
			'运行期间请勿最小化浏览器或频繁切屏。'
		])
	]);
}

let runningWatchTimer: ReturnType<typeof setInterval> | undefined;

function startRunningWatch(
	platform: CoursePlatform,
	setStatus: (text: string, type: StatusType) => void,
	onDone: () => void
) {
	if (runningWatchTimer) {
		clearInterval(runningWatchTimer);
	}
	let stableHits = 0;
	runningWatchTimer = setInterval(() => {
		if (platform.studyUrlTest.test(location.href)) {
			stableHits++;
			setStatus(`检测到学习/作业页面（${stableHits}s）… 脚本运行中，请保持页面在前台。`, 'info');
			if (stableHits >= 8) {
				clearInterval(runningWatchTimer);
				runningWatchTimer = undefined;
				$message.success(`${platform.name}：页面已由 OCS 接管，完成后可点击「标记为已完成」。`);
			}
		} else {
			stableHits = 0;
		}
	}, 1000);

	let workDoneHandled = false;
	const onWorkState = (workerState: string) => {
		if (workerState !== 'done' || workDoneHandled) return;
		workDoneHandled = true;
		clearInterval(runningWatchTimer);
		runningWatchTimer = undefined;
		setStatus('检测到答题任务已完成。', 'success');
		onDone();
		$modal.alert({ title: '✅ 完成', content: '本次作业/考试答题流程已结束。', maskCloseable: true });
	};
	CommonProject.scripts.workResults.on('work-state-change', onWorkState);
}
