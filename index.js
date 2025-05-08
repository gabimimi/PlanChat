import { createApp } from "vue";
import { GraffitiRemote } from "@graffiti-garden/implementation-remote";
import { GraffitiPlugin, useGraffitiDiscover } from "@graffiti-garden/wrapper-vue";


const AvatarIcon = {
  name: "AvatarIcon",
  props: {
    src:  { type: String, default: "" },
    alt:  { type: String, default: "Avatar" },
    size: { type: [Number, String], default: 32 }
  },
  template: `
    <img
      :src="src || './individualavatar.png'"
      :alt="alt"
      :width="size"
      :height="size"
      class="avatar-icon"
    />
  `
};

const app = createApp({

  data() {
    return {
      myMessage: "",
      sending: false,
      groupName: "",
      selectedChannel: null,
      selectedGroup: null,
      editingMessage: null,
      editContent: "",
      newGroupName: "",
      groupNameObjects: [],
      activeMenu: null,
      showGroupInfo: false,
      groupDescription: 'This is a sample group description.',
      groupMembers: [],
      isLoggedIn: false,
      showProfile: false,
      profileForm: {
        name: "",
        pronouns: "",
        bio: "",
        picture: "./individualavatar.png"
      },
      profileObjects: [],
      showInviteModal: false,
      inviteActor: "",
      membersObjects: [],
      showGroupDropdown: false,
      showCreateForm: false,
      showTaskAssignment: false,
      taskListsByGroup: {},  
      taskNotesByGroup: {}, 
      rawMessages: []
    };
  },


  setup() {
        const {objects: usersObjects} = useGraffitiDiscover(
          ['users'],
          {
                properties: {
                value: {
                    required: ['activity'],
                    properties: {
                    activity: { const: 'Login' }
                    },
                    required: ["activity"]
                }
                }
            }
        );
        return { usersObjects }
  },


  methods: {
    async login() {
      await this.$graffiti.login();
      console.log("🪪 Login dialog closed.");
    },
    
    addTask() {
      this.taskList = [
        ...this.taskList,
        { text: "", assignedTo: "", done: false }
      ];
    },

    updateTaskState(objects) {
      if (this.showTaskAssignment) return

      if (!Array.isArray(objects) || !this.selectedChannel) return;
      const mine = objects.filter(o => o.value.activity === 'Tasks');
      if (!mine.length) return;
      const latest = mine.reduce((a, b) =>
        (a.value.published ?? 0) > (b.value.published ?? 0) ? a : b
      );
    
      this.taskListsByGroup[this.selectedChannel] = latest.value.tasks || [];
      this.taskNotesByGroup[this.selectedChannel] = latest.value.notes || "";
      console.log("Loaded tasks via graffiti-discover:", latest.value);
    },
    
    removeTask(index) {
      const updated = [...this.taskList];
      updated.splice(index, 1);
      this.taskList = updated;
    },
    
    async saveTasks() {
      if (!this.selectedChannel) return;

      await this.$graffiti.put({
        channels: [this.selectedChannel],
        value: {
          activity: "Tasks",
          notes: this.taskNotes,
          tasks: this.taskList,
          published: Date.now()
        }
      }, this.$graffitiSession.value);

      alert("Tasks saved!");
    },
    
    async loadTasks() {
    // if (!this.selectedChannel) return;
    
    // const res = await this.$graffiti.query({
    //   channels: [this.selectedChannel],
    //   filters: [{ field: "value.activity", equals: "Tasks" }]
    // });
    // grab the graffiti session
      const session = this.$graffitiSession.value;
      if (!this.selectedChannel || !session?.store) {
        console.warn("No channel or no graffiti store available");
        return;
      }
      // query via the session's store
      const res = await session.store.query({
        channels: [this.selectedChannel],
        filters: [{ field: "value.activity", equals: "Tasks" }]
      });
        
      if (!res.objects.length) {
        this.taskList = [];
        this.taskNotes = "";
        console.log("No saved tasks for", this.selectedChannel);
        return;
      }
    
      const latest = res.objects.reduce((a, b) =>
        a.value.published > b.value.published ? a : b
      );
    
      console.log("Loaded tasks for", this.selectedChannel, latest);
      this.taskList = latest.value.tasks || [];
      this.taskNotes = latest.value.notes || "";
      },

    toggleMessageMenu(message) {
      this.activeMenu = this.activeMenu === message ? null : message;
    },
    toggleGroupDropdown() {
      this.showGroupDropdown = !this.showGroupDropdown;
    },
    async sendMessage(session) {
      if (!this.myMessage || !this.selectedChannel) return;
      this.sending = true;
      await this.$graffiti.put(
        {
          value: {
            content: this.myMessage,
            published: Date.now(),
            
          },
          channels: [this.selectedChannel],
        },
        session
      );
      this.myMessage = "";
      this.sending = false;
      await this.$nextTick();
      this.$refs.messageInput.focus();
    },

    onEnter() {
      this.sendMessage(this.$graffitiSession.value);
    },

    async createGroup(session) {
        const newChannel = crypto.randomUUID();

        // First: create the group
        await this.$graffiti.put(
          {
            value: {
              activity: "Create",
              object: {
                type: "Group Chat",
                name: this.groupName,
                channel: newChannel,
              },
            },
            channels: ['channelsPlanChat'],
          },
          session
        );
        
        // Then: publish the name-binding object
        await this.$graffiti.put(
          {
            value: {
              name: this.groupName,
              describes: newChannel,
            },
            channels: ['channelsPlanChat'],
          },
          session
        );
        this.groupMembers = [this.currentActor];

        await this.$graffiti.put({
          channels: [ newChannel ],
          value: {
            activity:  'Members',
            members:   this.groupMembers,
            published: Date.now()
          }
        }, session);

        this.selectedChannel = newChannel;
        this.groupName = "";
        groupMenu.classList.add('hidden');
        createGroupForm.classList.toggle('hidden');
        createGroupForm.classList.toggle('showing');
    },

    startEdit(message) {
      this.editingMessage = message;
      this.editContent = message.value.content;
    },

    cancelEdit() {
      this.editingMessage = null;
      this.editContent = "";
    },

    async saveEdit(message) {
      await this.$graffiti.patch(
        {
          value: [
            {
              op: "replace",
              path: "/content",
              value: this.editContent,
            },
          ],
        },
        message,
        this.$graffitiSession.value
      );
      this.editingMessage = null;
      this.editContent = "";
    },

    async deleteMessage(message) {
      await this.$graffiti.delete(message, this.$graffitiSession.value);
    },

    async renameGroup() {
      if (!this.newGroupName || !this.selectedChannel) return;
    
      await this.$graffiti.put(
        {
          value: {
            name: this.newGroupName,
            describes: this.selectedChannel,
          },
          channels: ["channelsPlanChat"],
        },
        this.$graffitiSession.value
      );
    
      this.newGroupName = "";
    

      const latestGroupObjects = await this.$graffiti.query({
        channels: ["channelsPlanChat"],
        filters: [{ field: "value.describes", equals: this.selectedChannel }],
      });
    
      this.updateGroupNameObjects(latestGroupObjects.objects);
    },

    getGroupName(channel) {
        const matches = this.groupNameObjects
          .filter((obj) => obj.value.describes === channel);
      
        if (matches.length === 0) return null;

        const latest = matches.reduce((a, b) => {
          const aTime = a.value.published ?? a.timestamp ?? 0;
          const bTime = b.value.published ?? b.timestamp ?? 0;
          return aTime > bTime ? a : b;
        });
      
        return latest.value.name;
    },

    updateGroupNameObjects(objs) {
      this.groupNameObjects = objs;
    },

    async saveProfile() {
      if (!this.currentActor) return;
      const profileObj = {
        name:      this.profileForm.name,
        pronouns:  this.profileForm.pronouns,
        bio:       this.profileForm.bio,
        picture:   this.profileForm.picture,     
        describes: this.currentActor,
        published: Date.now(),
        generator: "https://username.github.io/your-app/",
      };
      await this.$graffiti.put(
        { value: profileObj, generator: "https://username.github.io/your-app/", channels: [ this.currentActor, "designftw-2025-studio2" ] },
        this.$graffitiSession.value
      );
      alert("¡Perfil guardado!");
      this.showProfile = false;
    },

    async loadProfile() {
      if (!this.currentActor || !this.$graffitiSession.value?.store) return;
    
      const res = await this.$graffitiSession.value.store.query({
        channels: [this.currentActor]
      });
    
      const objs = res.objects.filter(
        (o) => o.value.describes === this.currentActor
      );
    
      if (!objs.length) return;
    
      const latest = objs.reduce((a, b) =>
        a.value.published > b.value.published ? a : b
      );
    
      this.profileForm.name     = latest.value.name;
      this.profileForm.pronouns = latest.value.pronouns;
      this.profileForm.bio      = latest.value.bio;
      this.profileForm.picture  = latest.value.picture ?? "./individualavatar.png";
    },

    onFileChange(event) {
      const file = event.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = e => {
        this.profileForm.picture = e.target.result;  // data URL
      };
      reader.readAsDataURL(file);
    },

    async recordLogin(session) {
      await this.$graffiti.put({
        value: {
          activity: "Login",
          actor:    session.actor,
          published: Date.now()
        },
        channels: ["users"],
      }, session);
      console.log("Actor logged in:", session.value.actor);
    },

    openInvite() {
      this.inviteActor = "";
      this.showInviteModal = true;
    },
    closeInvite() {
      this.showInviteModal = false;
      this.inviteActor = "";
    },

    async sendInvite() {
      const entered = this.inviteActor.trim();
    
      if (!entered) {
        return alert("Please enter a valid username");
      }
    
      const fullWebId = this.allUsers.find(u => this.shortName(u) === entered) || entered;

      // Check if the fullWebId is a known user
      const exists = this.allUsers.includes(fullWebId);
      if (!exists) {
        return alert(`User “${entered}” not found.`);
      }

      if (this.groupMembers.includes(fullWebId)) {
        return alert(`User “${entered}” is already in the group.`);
      }
    
      await this.$graffiti.put({
        value: {
          activity: "Invite",
          group: this.selectedChannel,
          from: this.currentActor,
          published: Date.now()
        },
        channels: [fullWebId]
      }, this.$graffitiSession.value);
    
      this.groupMembers.push(fullWebId);
      await this.saveGroupMembers();

      alert(`Invitation sent to ${entered}`);
      this.closeInvite();
    },

    shortName(uri) {
      try {
        return new URL(uri).pathname.replace(/^\/+/, '');
      } catch {
        return uri;
      }
    },

    async saveGroupMembers() {
      if (!this.selectedChannel) return;
      await this.$graffiti.put({
        channels: [ this.selectedChannel ],
        value: {
          activity:  'Members',
          members:   this.groupMembers,
          published: Date.now()
        }
      }, this.$graffitiSession.value);
    },
  
    
    updateMembers(objs) {
      // objs viene del discover: array de todos los events "Members"
      if (!Array.isArray(objs)) {
        this.groupMembers = [];
        return;
      }
      // Solo los events “Members”
      const mine = objs.filter(o => o.value.activity === 'Members');
      if (!mine.length) {
        this.groupMembers = [];
        return;
      }
      // Elegimos el más reciente
      const latest = mine.reduce((a, b) =>
        a.value.published > b.value.published ? a : b
      );
      this.groupMembers = [ ...latest.value.members ];
    },

    memberAvatar(objects) {
      if (!objects.length) {
        return './individualavatar.png';
      }
      const latest = objects.reduce((a, b) =>
        a.value.published > b.value.published ? a : b
      );
      return latest.value.picture || './individualavatar.png';
    }
    
  },

  watch: {
     $graffitiSession(session) {
      this.loadProfile();
    },
    selectedChannel(newChannel) {
      if (newChannel) {
        this.loadTasks();
      }
    },
    $graffitiSession: {
      handler(session) {
        const actor = session?.value?.actor;
        if (!actor) return;
  
        console.log("Logged in as", actor);
  
        const alreadyLogged = this.usersObjects.some(
          (obj) => obj.value?.actor === actor
        );
  
        if (!alreadyLogged) {
          this.$graffiti.put({
            value: {
              activity: "Login",
              actor,
              published: Date.now()
            },
            channels: ["users"]
          }, session.value).then(() => {
            console.log("Login recorded for:", actor);
          });
        }
  
        this.loadProfile();
      },
      immediate: true
    },
    currentActor(newA, oldA) {
      if (newA && newA !== oldA) {
        this.profileForm = { name: "", pronouns: "", bio: "", picture: "" };
        this.profileObjects = [];
      }
    },
    profileObjects(objs) {
      if (!objs?.length) return;
      const mine = objs.filter(o => o.value.describes === this.currentActor);
      if (!mine.length) return;
      const latest = mine.reduce((a,b) =>
        a.value.published > b.value.published ? a : b
      );
      Object.assign(this.profileForm, {
        name:     latest.value.name,
        pronouns: latest.value.pronouns,
        bio:      latest.value.bio,
        picture:  latest.value.picture || ""
      });
    },

    membersObjects: {
        handler(objs) {
          this.updateMembers(Array.isArray(objs) ? objs : []);
        },
        immediate: true
      }


  },

  computed: {
    currentActor() {
      return this.$graffitiSession.value?.actor ?? null;
    },
    allUsers() {
      return Array.isArray(this.usersObjects)
          ? this.usersObjects.map((o) => o.actor? o.actor : '')
          : [];
    },
    setUsers() {
      return new Set(this.allUsers);
    },
    formattedUsers() {
      return Array.from(this.setUsers).map(actor => {
        let display;
        try {
          const url = new URL(actor);
          display = url.pathname.replace(/^\/+/, ''); // get user from URL
        } catch {
          display = actor;
        }
        return display;
      });
    }, 
    taskList: {
      get() {
        return this.taskListsByGroup[this.selectedChannel] || [];
      },
      set(val) {
        this.taskListsByGroup = {
          ...this.taskListsByGroup,
          [this.selectedChannel]: val
        };
      }
    },
    taskNotes: {
      get() {
        return this.taskNotesByGroup[this.selectedChannel] || "";
      },
      set(val) {
        this.taskNotesByGroup = {
          ...this.taskNotesByGroup,
          [this.selectedChannel]: val
        };
      }
    },
    sortedMessages() {
      return [...(this.rawMessages|| [])].sort((a, b) => {
        return (a.value.published ?? 0) - (b.value.published ?? 0);
      });
    }
  },

  mounted() {
    this.loadProfile();
    const unwatch = this.$watch(
      () => this.$refs.groupNameDiscover?.$data?.objects,
      (newObjects) => {
        if (newObjects) this.groupNameObjects = newObjects;
      },
      { immediate: true }
      
    );
    
    this.$watch(
      () => this.$refs.profileDiscover?.$data.objects,
      (objs) => {
        if (!objs || objs.length === 0) return;
        const latest = objs.reduce((a, b) =>
          (a.value.published > b.value.published ? a : b)
        );
        this.profileForm.name     = latest.value.name;
        this.profileForm.pronouns = latest.value.pronouns;
        this.profileForm.bio      = latest.value.bio;
      },
      { immediate: true }

    );

    this.$nextTick(() => {
      this.$watch(
        () => this.$refs.profileDiscover?.$data.objects,
        (objs) => {
          if (!objs?.length) return;
          const mine = objs.filter(
            (o) => o.value.describes === this.currentActor
          );
          if (!mine.length) return;
          const latest = mine.reduce((a, b) =>
            a.value.published > b.value.published ? a : b
          );

          this.profileForm.name     = latest.value.name;
          this.profileForm.pronouns = latest.value.pronouns;
          this.profileForm.bio      = latest.value.bio;
        },
        { immediate: true }
      );

      //const toggleMenuBtn = document.getElementById('toggleGroupMenu');
      const groupMenu = document.getElementById('groupMenu');
      const showCreateFormBtn = document.getElementById('showCreateForm');
      const createGroupForm = document.getElementById('createGroupForm');

      // if (toggleMenuBtn && groupMenu) {
      //   toggleMenuBtn.addEventListener('click', () => {
      //     groupMenu.classList.toggle('hidden');
      //   });
      // }

      if (showCreateFormBtn && groupMenu && createGroupForm) {
        showCreateFormBtn.addEventListener('click', () => {
          groupMenu.classList.add('hidden');
          createGroupForm.classList.toggle('hidden');
          createGroupForm.classList.toggle('showing');
        });
      }
    });

    const session = this.$graffitiSession.value;
    if (session) {
      this.recordLogin(session);}


    this.$watch(
      () => this.$refs.usersDiscover?.$data.objects,
      (objs) => {
        if (Array.isArray(objs)) {
          this.usersObjects = objs;
          console.log("🚀 usersObjects actualizados:", objs);
        }
      },
      { immediate: true }
    );

    this.$watch(
      () => this.$refs.membersDiscover?.$data.objects,
      (objs) => {
        this.updateMembers(Array.isArray(objs) ? objs : []);
      },
      { immediate: true }
    );

    this.$watch(
      () => this.$graffitiSession.value?.actor,
      (newActor, oldActor) => {
        if (newActor && newActor !== oldActor) {
          console.log("✅ Actor logged in:", newActor);
  
          // Optionally log to 'users' channel
          const alreadyLogged = this.usersObjects.some(
            (obj) => obj.value?.actor === newActor
          );
  
          if (!alreadyLogged) {
            this.$graffiti.put({
              value: {
                activity: "Login",
                actor: newActor,
                published: Date.now()
              },
              channels: ["users"]
            }, this.$graffitiSession.value).then(() => {
              console.log("📝 Login recorded for:", newActor);
            });
          }
  
          this.loadProfile();
        }
      },
      { immediate: true }
    );
  },


});

app.component("avatar-icon", AvatarIcon);

app
  .use(GraffitiPlugin, {
    graffiti: new GraffitiRemote(),
  })
  .mount("#app");